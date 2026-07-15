"""Named conversations with bounded memory, verified citations, and typed SSE."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
import time
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.authz import assert_file_owner
from core.config import settings
from core.rate_limit import rate_limit
from core.security import get_current_user
from core.observability import (
    CHAT_FIRST_TOKEN,
    INVALID_CITATIONS,
    PROVIDER_ERRORS,
    PROVIDER_FALLBACKS,
    RETRIEVAL_LATENCY,
    log_event,
)
from core.usage_limits import usage_limiter
from models.conversation import (
    Conversation,
    ConversationDocument,
    ConversationMessage,
    MessageCitation,
    OutboxEvent,
)
from models.database import async_session, get_db
from models.file import File
from services.citation_service import (
    citation_payloads,
    format_sources,
    label_sources,
    validate_citations,
)
from services.conversation_context_service import conversation_context_service, estimate_tokens
from services.document_index_service import document_index_service
from services.model_registry import ChatModel, fallback_chat_model, resolve_chat_model
from services.provider_service import ProviderUnavailable, provider_service
from services.stream_event_service import stream_event_service
from services.usage_service import usage_service


router = APIRouter()


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    mode: Literal["general", "document"] = "general"
    documentIds: list[uuid.UUID] = Field(default_factory=list, max_length=20)
    modelId: str | None = None


class ConversationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    status: Literal["active", "archived"] | None = None
    mode: Literal["general", "document"] | None = None
    modelId: str | None = None


class ConversationDocumentsUpdate(BaseModel):
    documentIds: list[uuid.UUID] = Field(default_factory=list, max_length=20)


class ConversationMessageCreate(BaseModel):
    requestId: uuid.UUID
    content: str = Field(min_length=1, max_length=30000)
    modelId: str | None = None
    reasoning: bool = False


class ConversationRetry(BaseModel):
    requestId: uuid.UUID
    modelId: str | None = None
    reasoning: bool | None = None


def _owner_sub(user: dict) -> str:
    owner_sub = (user.get("sub") or "").strip()
    if not owner_sub:
        raise HTTPException(status_code=401, detail="Missing Clerk subject")
    return owner_sub


def _resolve_model(model_id: str | None, reasoning: bool) -> ChatModel:
    selected = resolve_chat_model(model_id, reasoning)
    if selected is None:
        raise HTTPException(status_code=400, detail=f"Unsupported model: {model_id}")
    return selected


async def _get_conversation(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    owner_sub: str,
) -> Conversation:
    conversation = (
        await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    ).scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.owner_sub != owner_sub:
        raise HTTPException(status_code=403, detail="Forbidden")
    return conversation


async def _owned_files(
    db: AsyncSession,
    file_ids: list[uuid.UUID],
    user: dict,
) -> list[File]:
    if not file_ids:
        return []
    records = (
        await db.execute(select(File).where(File.file_id.in_(file_ids)))
    ).scalars().all()
    if len(records) != len(set(file_ids)):
        raise HTTPException(status_code=404, detail="One or more documents were not found")

    owner_sub = _owner_sub(user)
    for record in records:
        assert_file_owner(record, user)
        if not record.owner_sub:
            record.owner_sub = owner_sub
        if record.status != "ready":
            raise HTTPException(
                status_code=409,
                detail=f"{record.file_name} is not ready for chat",
            )
    return records


async def _conversation_document_ids(
    db: AsyncSession,
    conversation_id: uuid.UUID,
) -> list[uuid.UUID]:
    return list(
        (
            await db.execute(
                select(ConversationDocument.file_id)
                .where(ConversationDocument.conversation_id == conversation_id)
                .order_by(ConversationDocument.added_at.asc())
            )
        ).scalars().all()
    )


async def _conversation_payload(db: AsyncSession, conversation: Conversation) -> dict:
    document_ids = await _conversation_document_ids(db, conversation.id)
    message_count = int(
        (
            await db.execute(
                select(func.count())
                .select_from(ConversationMessage)
                .where(ConversationMessage.conversation_id == conversation.id)
            )
        ).scalar()
        or 0
    )
    return {
        "id": str(conversation.id),
        "title": conversation.title,
        "mode": conversation.mode,
        "status": conversation.status,
        "selectedModelId": conversation.selected_model_id,
        "documentIds": [str(file_id) for file_id in document_ids],
        "messageCount": message_count,
        "createdAt": conversation.created_at.isoformat(),
        "updatedAt": conversation.updated_at.isoformat(),
        "lastMessageAt": (
            conversation.last_message_at.isoformat()
            if conversation.last_message_at
            else None
        ),
    }


def _citation_payload(citation: MessageCitation) -> dict:
    return {
        "id": str(citation.id),
        "sourceLabel": citation.source_label,
        "sourceOrder": citation.source_order,
        "chunkId": str(citation.chunk_id) if citation.chunk_id else None,
        "fileId": str(citation.source_file_id) if citation.source_file_id else None,
        "fileName": citation.file_name,
        "excerpt": citation.excerpt,
        "pageStart": citation.page_start,
        "pageEnd": citation.page_end,
        "startTime": citation.start_time,
        "endTime": citation.end_time,
        "retrievalRank": citation.retrieval_rank,
        "retrievalScore": citation.retrieval_score,
        "sourceRemoved": citation.source_removed,
    }


async def _message_payload(db: AsyncSession, message: ConversationMessage) -> dict:
    citations = (
        await db.execute(
            select(MessageCitation)
            .where(MessageCitation.message_id == message.id)
            .order_by(MessageCitation.source_order.asc())
        )
    ).scalars().all()
    return {
        "id": str(message.id),
        "conversationId": str(message.conversation_id),
        "parentMessageId": str(message.parent_message_id) if message.parent_message_id else None,
        "role": message.role,
        "content": message.content,
        "status": message.status,
        "provider": message.provider,
        "originalProvider": message.original_provider,
        "modelId": message.model_id,
        "reasoning": message.reasoning,
        "fallbackUsed": message.fallback_used,
        "requestId": str(message.request_id) if message.request_id else None,
        "usage": {
            "promptTokens": message.prompt_tokens,
            "completionTokens": message.completion_tokens,
            "totalTokens": message.total_tokens,
            "contextWindow": message.context_window,
            "contextUsed": message.context_used,
            "contextRemaining": max(0, message.context_window - message.context_used),
        },
        "citations": [_citation_payload(citation) for citation in citations],
        "error": (
            {"code": message.error_code, "detail": message.error_detail}
            if message.error_code
            else None
        ),
        "createdAt": message.created_at.isoformat(),
        "completedAt": message.completed_at.isoformat() if message.completed_at else None,
    }


def _sse(event: dict) -> str:
    return (
        f"id: {event['id']}\n"
        f"event: {event['type']}\n"
        f"data: {json.dumps(event, separators=(',', ':'))}\n\n"
    )


async def _repair_citations(
    answer: str,
    sources: list[dict],
    model: ChatModel,
) -> tuple[str, dict | None]:
    repair_messages = [
        {
            "role": "system",
            "content": (
                "Repair citation markers in the answer. Preserve supported meaning, remove unsupported claims, "
                "and cite only the supplied labels in [[S1]] form. Return only the repaired answer. "
                "If the sources are insufficient, say so clearly."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Sources:\n{format_sources(sources)}\n\n"
                f"Answer to repair:\n{answer}"
            ),
        },
    ]
    try:
        repaired, metadata = await provider_service.complete(
            model,
            repair_messages,
            reasoning=False,
        )
    except ProviderUnavailable:
        return answer, None
    valid, _ = validate_citations(repaired, sources)
    return (repaired, metadata) if valid else (answer, None)


async def _persist_citations(
    db: AsyncSession,
    assistant_message_id: uuid.UUID,
    payloads: list[dict],
) -> list[MessageCitation]:
    await db.execute(
        delete(MessageCitation).where(MessageCitation.message_id == assistant_message_id)
    )
    citations: list[MessageCitation] = []
    for payload in payloads:
        citation = MessageCitation(
            message_id=assistant_message_id,
            chunk_id=uuid.UUID(payload["chunkId"]),
            source_file_id=uuid.UUID(payload["fileId"]),
            source_label=payload["sourceLabel"],
            source_order=payload["sourceOrder"],
            file_name=payload["fileName"],
            excerpt=payload["excerpt"],
            page_start=payload["pageStart"],
            page_end=payload["pageEnd"],
            start_time=payload["startTime"],
            end_time=payload["endTime"],
            retrieval_rank=payload["retrievalRank"],
            retrieval_score=payload["retrievalScore"],
        )
        db.add(citation)
        citations.append(citation)
    await db.flush()
    return citations


async def _queue_summary_if_due(
    db: AsyncSession,
    conversation: Conversation,
    completed_message_id: uuid.UUID,
) -> None:
    completed_count = int(
        (
            await db.execute(
                select(func.count())
                .select_from(ConversationMessage)
                .where(
                    ConversationMessage.conversation_id == conversation.id,
                    ConversationMessage.status == "complete",
                )
            )
        ).scalar()
        or 0
    )
    threshold = max(2, settings.CHAT_SUMMARY_MESSAGE_THRESHOLD)
    if completed_count < threshold or completed_count % threshold != 0:
        return
    db.add(
        OutboxEvent(
            event_type="conversation.summarize",
            aggregate_id=str(conversation.id),
            payload={
                "conversationId": str(conversation.id),
                "throughMessageId": str(completed_message_id),
            },
        )
    )


async def _run_turn(
    *,
    request: Request,
    conversation_id: uuid.UUID,
    assistant_message_id: uuid.UUID,
    user_message_id: uuid.UUID,
    request_id: uuid.UUID,
    owner_sub: str,
    question: str,
    model: ChatModel,
    reasoning: bool,
):
    sequence = 0

    async def event(event_type: str, payload: dict) -> str:
        nonlocal sequence
        sequence += 1
        envelope = {
            "id": sequence,
            "version": 1,
            "type": event_type,
            "messageId": str(assistant_message_id),
            **payload,
        }
        await stream_event_service.append(str(assistant_message_id), envelope)
        return _sse(envelope)

    try:
        yield await event(
            "message.started",
            {
                "conversationId": str(conversation_id),
                "requestId": str(request_id),
            },
        )

        async with async_session() as db:
            conversation = await _get_conversation(db, conversation_id, owner_sub)
            file_ids = (
                await _conversation_document_ids(db, conversation_id)
                if conversation.mode == "document"
                else []
            )
            file_records = []
            if file_ids:
                file_records = (
                    await db.execute(select(File).where(File.file_id.in_(file_ids)))
                ).scalars().all()
            file_names = {str(file.file_id): file.file_name for file in file_records}

            chunks = []
            if file_ids:
                retrieval_started = time.perf_counter()
                try:
                    chunks = await document_index_service.search(
                        db,
                        owner_sub=owner_sub,
                        file_ids=file_ids,
                        query=question,
                    )
                finally:
                    RETRIEVAL_LATENCY.observe(time.perf_counter() - retrieval_started)
            sources = label_sources(chunks, file_names)
            fallback = fallback_chat_model(model, reasoning)
            budget_model = (
                fallback
                if fallback and fallback["contextWindow"] < model["contextWindow"]
                else model
            )
            built = await conversation_context_service.build(
                db,
                conversation=conversation,
                current_user_message_id=user_message_id,
                current_question=question,
                model=budget_model,
                reasoning=reasoning,
                sources=sources,
            )

        response_parts: list[str] = []
        provider_metadata = {
            "provider": model["provider"],
            "modelId": model["id"],
            "fallbackUsed": False,
            "originalProvider": model["provider"],
            "promptTokens": 0,
            "completionTokens": 0,
            "totalTokens": 0,
        }
        stream = provider_service.stream_chat(
            model,
            built.messages,
            reasoning=reasoning,
        )
        iterator = stream.__aiter__()
        provider_started = time.perf_counter()
        first_token_recorded = False
        pending: asyncio.Task | None = asyncio.create_task(anext(iterator))
        try:
            while pending is not None:
                done, _ = await asyncio.wait(
                    {pending},
                    timeout=max(1, settings.CHAT_HEARTBEAT_SECONDS),
                )
                if not done:
                    if await request.is_disconnected():
                        raise asyncio.CancelledError
                    yield await event("heartbeat", {"at": datetime.utcnow().isoformat()})
                    continue

                try:
                    provider_event = pending.result()
                except StopAsyncIteration:
                    pending = None
                    break

                if provider_event["type"] == "delta":
                    if not first_token_recorded:
                        CHAT_FIRST_TOKEN.labels(
                            str(provider_event.get("provider") or model["provider"]),
                            str(provider_event.get("modelId") or model["id"]),
                        ).observe(time.perf_counter() - provider_started)
                        first_token_recorded = True
                    text = str(provider_event.get("text") or "")
                    response_parts.append(text)
                    yield await event("response.delta", {"text": text})
                elif provider_event["type"] == "usage":
                    provider_metadata.update(provider_event)
                pending = asyncio.create_task(anext(iterator))
        finally:
            if pending is not None and not pending.done():
                pending.cancel()

        answer = "".join(response_parts).strip()
        valid, _ = validate_citations(answer, built.sources)
        repair_metadata = None
        if built.sources and not valid:
            INVALID_CITATIONS.inc()
            repaired, repair_metadata = await _repair_citations(answer, built.sources, model)
            repaired_valid, _ = validate_citations(repaired, built.sources)
            if repaired_valid:
                answer = repaired
            else:
                answer = (
                    "The selected excerpts do not contain enough information for a fully "
                    "verifiable answer. Try a narrower question or attach another source."
                )

        if repair_metadata:
            provider_metadata["fallbackUsed"] = bool(
                provider_metadata.get("fallbackUsed")
                or repair_metadata.get("fallbackUsed")
            )
        citation_data = citation_payloads(answer, built.sources)
        completion_tokens = int(provider_metadata.get("completionTokens") or estimate_tokens(answer))
        prompt_tokens = int(provider_metadata.get("promptTokens") or built.prompt_tokens)
        total_tokens = int(provider_metadata.get("totalTokens") or prompt_tokens + completion_tokens)

        async with async_session() as db:
            assistant = (
                await db.execute(
                    select(ConversationMessage).where(
                        ConversationMessage.id == assistant_message_id
                    )
                )
            ).scalar_one()
            conversation = await _get_conversation(db, conversation_id, owner_sub)
            assistant.content = answer
            assistant.status = "complete"
            assistant.provider = str(provider_metadata["provider"])
            assistant.original_provider = str(provider_metadata["originalProvider"])
            assistant.model_id = str(provider_metadata["modelId"])
            assistant.fallback_used = bool(provider_metadata["fallbackUsed"])
            assistant.prompt_tokens = prompt_tokens
            assistant.completion_tokens = completion_tokens
            assistant.total_tokens = total_tokens
            assistant.context_window = built.context_window
            assistant.context_used = built.context_used
            assistant.completed_at = datetime.utcnow()
            citations = await _persist_citations(db, assistant_message_id, citation_data)

            conversation.selected_model_id = assistant.model_id
            conversation.last_message_at = assistant.completed_at
            conversation.updated_at = assistant.completed_at
            await usage_service.settle(
                db,
                request_id=request_id,
                owner_sub=owner_sub,
                provider=assistant.provider,
                model_id=assistant.model_id,
                metadata={
                    "promptTokens": prompt_tokens,
                    "completionTokens": completion_tokens,
                    "totalTokens": total_tokens,
                    "fallbackUsed": assistant.fallback_used,
                },
            )
            await _queue_summary_if_due(db, conversation, assistant_message_id)
            await db.commit()

        if assistant.fallback_used:
            PROVIDER_FALLBACKS.labels(
                assistant.original_provider or model["provider"],
                assistant.provider or model["provider"],
            ).inc()
        log_event(
            "chat.message.completed",
            request_id=request_id,
            user_id=owner_sub,
            conversation_id=conversation_id,
            message_id=assistant_message_id,
            provider=assistant.provider,
            original_provider=assistant.original_provider,
            model=assistant.model_id,
            fallback=assistant.fallback_used,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            citations=len(citations),
        )

        for citation in citations:
            yield await event("citation", {"citation": _citation_payload(citation)})
        yield await event(
            "usage",
            {
                "usage": {
                    "promptTokens": prompt_tokens,
                    "completionTokens": completion_tokens,
                    "totalTokens": total_tokens,
                    "contextWindow": built.context_window,
                    "contextUsed": built.context_used,
                    "contextRemaining": max(0, built.context_window - built.context_used),
                }
            },
        )
        yield await event(
            "message.completed",
            {
                "content": answer,
                "provider": provider_metadata["provider"],
                "originalProvider": provider_metadata["originalProvider"],
                "modelId": provider_metadata["modelId"],
                "fallbackUsed": bool(provider_metadata["fallbackUsed"]),
            },
        )
    except asyncio.CancelledError:
        async with async_session() as db:
            assistant = (
                await db.execute(
                    select(ConversationMessage).where(
                        ConversationMessage.id == assistant_message_id
                    )
                )
            ).scalar_one_or_none()
            if assistant and assistant.status == "streaming":
                assistant.status = "failed"
                assistant.error_code = "stream_interrupted"
                assistant.error_detail = "The client disconnected before completion."
                assistant.completed_at = datetime.utcnow()
                await usage_service.refund(db, request_id=request_id, owner_sub=owner_sub)
                await db.commit()
        raise
    except Exception as exc:
        provider_code = (
            "provider_unavailable"
            if isinstance(exc, ProviderUnavailable)
            else exc.__class__.__name__
        )
        PROVIDER_ERRORS.labels(model["provider"], provider_code).inc()
        async with async_session() as db:
            assistant = (
                await db.execute(
                    select(ConversationMessage).where(
                        ConversationMessage.id == assistant_message_id
                    )
                )
            ).scalar_one_or_none()
            if assistant:
                assistant.status = "failed"
                assistant.error_code = (
                    "provider_unavailable"
                    if isinstance(exc, ProviderUnavailable)
                    else "generation_failed"
                )
                assistant.error_detail = str(exc)[:1000]
                assistant.completed_at = datetime.utcnow()
            await usage_service.refund(db, request_id=request_id, owner_sub=owner_sub)
            await db.commit()
        log_event(
            "chat.message.failed",
            request_id=request_id,
            user_id=owner_sub,
            conversation_id=conversation_id,
            message_id=assistant_message_id,
            provider=model["provider"],
            model=model["id"],
            error=provider_code,
        )
        yield await event(
            "message.failed",
            {
                "error": {
                    "code": "provider_unavailable"
                    if isinstance(exc, ProviderUnavailable)
                    else "generation_failed",
                    "detail": "The response could not be completed. Retry this message.",
                    "retryable": True,
                }
            },
        )
    finally:
        await usage_limiter.release_stream_slot(owner_sub)


async def _start_turn(
    *,
    request: Request,
    conversation: Conversation,
    owner_sub: str,
    body: ConversationMessageCreate,
    model: ChatModel,
    db: AsyncSession,
    existing_user_message: ConversationMessage | None = None,
) -> StreamingResponse:
    duplicate = (
        await db.execute(
            select(ConversationMessage).where(
                ConversationMessage.conversation_id == conversation.id,
                ConversationMessage.request_id == body.requestId,
            )
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        return _replay_response(duplicate.id, owner_sub, 0)

    await usage_limiter.acquire_stream_slot(owner_sub)
    try:
        if existing_user_message is None:
            user_message = ConversationMessage(
                conversation_id=conversation.id,
                role="user",
                content=body.content.strip(),
                status="complete",
                completed_at=datetime.utcnow(),
            )
            db.add(user_message)
            await db.flush()
        else:
            user_message = existing_user_message

        assistant_message = ConversationMessage(
            conversation_id=conversation.id,
            parent_message_id=user_message.id,
            role="assistant",
            content="",
            status="streaming",
            provider=model["provider"],
            original_provider=model["provider"],
            model_id=model["id"],
            reasoning=body.reasoning,
            request_id=body.requestId,
            context_window=model["contextWindow"],
        )
        db.add(assistant_message)
        await db.flush()
        await usage_service.reserve(
            db,
            owner_sub=owner_sub,
            request_id=body.requestId,
            units=model["creditCost"],
            conversation_id=conversation.id,
            message_id=assistant_message.id,
            provider=model["provider"],
            model_id=model["id"],
        )

        now = datetime.utcnow()
        conversation.last_message_at = now
        conversation.updated_at = now
        conversation.selected_model_id = model["id"]
        if conversation.title == "New chat":
            conversation.title = body.content.strip()[:80]
        await db.commit()
    except Exception:
        await usage_limiter.release_stream_slot(owner_sub)
        raise

    return StreamingResponse(
        _run_turn(
            request=request,
            conversation_id=conversation.id,
            assistant_message_id=assistant_message.id,
            user_message_id=user_message.id,
            request_id=body.requestId,
            owner_sub=owner_sub,
            question=user_message.content,
            model=model,
            reasoning=body.reasoning,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _replay_response(
    message_id: uuid.UUID,
    owner_sub: str,
    after_event_id: int,
) -> StreamingResponse:
    async def replay():
        current_event_id = after_event_id
        max_polls = max(30, int(settings.CHAT_PROVIDER_TOTAL_TIMEOUT_SECONDS))
        for poll in range(max_polls):
            buffered = await stream_event_service.after(
                str(message_id), current_event_id
            )
            for envelope in buffered:
                current_event_id = max(current_event_id, int(envelope.get("id", 0)))
                yield _sse(envelope)
                if envelope.get("type") in {"message.completed", "message.failed"}:
                    return

            async with async_session() as db:
                message = (
                    await db.execute(
                        select(ConversationMessage)
                        .join(
                            Conversation,
                            Conversation.id == ConversationMessage.conversation_id,
                        )
                        .where(
                            ConversationMessage.id == message_id,
                            Conversation.owner_sub == owner_sub,
                        )
                    )
                ).scalar_one_or_none()
                if message is None:
                    return
                if message.status in {"complete", "failed", "cancelled"}:
                    payload = await _message_payload(db, message)
                    event_type = (
                        "message.completed"
                        if message.status == "complete"
                        else "message.failed"
                    )
                    envelope = {
                        "id": current_event_id + 1,
                        "version": 1,
                        "type": event_type,
                        "messageId": str(message.id),
                        "message": payload,
                        "content": message.content,
                        "error": payload.get("error"),
                    }
                    yield _sse(envelope)
                    return

            if poll and poll % max(1, settings.CHAT_HEARTBEAT_SECONDS) == 0:
                yield ": heartbeat\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        replay(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate,
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    owner_sub = _owner_sub(user)
    files = await _owned_files(db, body.documentIds, user)
    if body.mode == "document" and not files:
        raise HTTPException(status_code=400, detail="Document mode requires a document")

    conversation = Conversation(
        owner_sub=owner_sub,
        title=(body.title or "New chat").strip() or "New chat",
        mode=body.mode,
        selected_model_id=body.modelId,
    )
    db.add(conversation)
    await db.flush()
    for file_record in files:
        db.add(
            ConversationDocument(
                conversation_id=conversation.id,
                file_id=file_record.file_id,
            )
        )
    await db.commit()
    return await _conversation_payload(db, conversation)


@router.get("/conversations")
async def list_conversations(
    includeArchived: bool = False,
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    owner_sub = _owner_sub(user)
    stmt = select(Conversation).where(Conversation.owner_sub == owner_sub)
    if not includeArchived:
        stmt = stmt.where(Conversation.status == "active")
    conversations = (
        await db.execute(
            stmt.order_by(
                Conversation.last_message_at.desc().nullslast(),
                Conversation.updated_at.desc(),
            ).limit(100)
        )
    ).scalars().all()
    return [await _conversation_payload(db, conversation) for conversation in conversations]


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: uuid.UUID,
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await _get_conversation(db, conversation_id, _owner_sub(user))
    return await _conversation_payload(db, conversation)


@router.patch("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: uuid.UUID,
    body: ConversationUpdate,
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await _get_conversation(db, conversation_id, _owner_sub(user))
    if body.title is not None:
        conversation.title = body.title.strip()
    if body.status is not None:
        conversation.status = body.status
    if body.mode is not None:
        if body.mode == "document" and not await _conversation_document_ids(db, conversation.id):
            raise HTTPException(status_code=400, detail="Document mode requires a document")
        conversation.mode = body.mode
    if body.modelId is not None:
        _resolve_model(body.modelId, False)
        conversation.selected_model_id = body.modelId
    conversation.updated_at = datetime.utcnow()
    await db.commit()
    return await _conversation_payload(db, conversation)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID,
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await _get_conversation(db, conversation_id, _owner_sub(user))
    await db.delete(conversation)
    await db.commit()


@router.put("/conversations/{conversation_id}/documents")
async def set_conversation_documents(
    conversation_id: uuid.UUID,
    body: ConversationDocumentsUpdate,
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await _get_conversation(db, conversation_id, _owner_sub(user))
    files = await _owned_files(db, body.documentIds, user)
    await db.execute(
        delete(ConversationDocument).where(
            ConversationDocument.conversation_id == conversation.id
        )
    )
    for file_record in files:
        db.add(
            ConversationDocument(
                conversation_id=conversation.id,
                file_id=file_record.file_id,
            )
        )
    conversation.mode = "document" if files else "general"
    conversation.updated_at = datetime.utcnow()
    await db.commit()
    return await _conversation_payload(db, conversation)


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(
    conversation_id: uuid.UUID,
    cursor: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await _get_conversation(db, conversation_id, _owner_sub(user))
    stmt = select(ConversationMessage).where(
        ConversationMessage.conversation_id == conversation.id
    )
    if cursor:
        cursor_message = (
            await db.execute(
                select(ConversationMessage).where(
                    ConversationMessage.id == cursor,
                    ConversationMessage.conversation_id == conversation.id,
                )
            )
        ).scalar_one_or_none()
        if cursor_message:
            stmt = stmt.where(ConversationMessage.created_at < cursor_message.created_at)

    rows = (
        await db.execute(stmt.order_by(ConversationMessage.created_at.desc()).limit(limit + 1))
    ).scalars().all()
    has_more = len(rows) > limit
    page = rows[:limit]
    page.reverse()
    return {
        "items": [await _message_payload(db, message) for message in page],
        "nextCursor": str(rows[limit - 1].id) if has_more else None,
    }


@router.post("/conversations/{conversation_id}/messages")
async def create_conversation_message(
    conversation_id: uuid.UUID,
    body: ConversationMessageCreate,
    request: Request,
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    owner_sub = _owner_sub(user)
    conversation = await _get_conversation(db, conversation_id, owner_sub)
    if conversation.status != "active":
        raise HTTPException(status_code=409, detail="Conversation is archived")
    if conversation.mode == "document" and not await _conversation_document_ids(db, conversation.id):
        raise HTTPException(status_code=400, detail="Select at least one document")
    model = _resolve_model(body.modelId or conversation.selected_model_id, body.reasoning)
    return await _start_turn(
        request=request,
        conversation=conversation,
        owner_sub=owner_sub,
        body=body,
        model=model,
        db=db,
    )


@router.post("/conversations/{conversation_id}/messages/{message_id}/retry")
async def retry_conversation_message(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    body: ConversationRetry,
    request: Request,
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    owner_sub = _owner_sub(user)
    conversation = await _get_conversation(db, conversation_id, owner_sub)
    failed = (
        await db.execute(
            select(ConversationMessage).where(
                ConversationMessage.id == message_id,
                ConversationMessage.conversation_id == conversation.id,
                ConversationMessage.role == "assistant",
                ConversationMessage.status == "failed",
            )
        )
    ).scalar_one_or_none()
    if failed is None or failed.parent_message_id is None:
        raise HTTPException(status_code=409, detail="Message is not retryable")
    user_message = (
        await db.execute(
            select(ConversationMessage).where(
                ConversationMessage.id == failed.parent_message_id,
                ConversationMessage.conversation_id == conversation.id,
                ConversationMessage.role == "user",
            )
        )
    ).scalar_one_or_none()
    if user_message is None:
        raise HTTPException(status_code=409, detail="Original question is unavailable")

    reasoning = failed.reasoning if body.reasoning is None else body.reasoning
    retry_body = ConversationMessageCreate(
        requestId=body.requestId,
        content=user_message.content,
        modelId=body.modelId or failed.model_id or conversation.selected_model_id,
        reasoning=reasoning,
    )
    model = _resolve_model(retry_body.modelId, reasoning)
    return await _start_turn(
        request=request,
        conversation=conversation,
        owner_sub=owner_sub,
        body=retry_body,
        model=model,
        db=db,
        existing_user_message=user_message,
    )


@router.get("/conversations/{conversation_id}/messages/{message_id}/events")
async def replay_message_events(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    after: int = Query(default=0, ge=0),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    owner_sub = _owner_sub(user)
    await _get_conversation(db, conversation_id, owner_sub)
    message = (
        await db.execute(
            select(ConversationMessage).where(
                ConversationMessage.id == message_id,
                ConversationMessage.conversation_id == conversation_id,
            )
        )
    ).scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    try:
        header_after = int(last_event_id or 0)
    except ValueError:
        header_after = 0
    return _replay_response(message.id, owner_sub, max(after, header_after))
