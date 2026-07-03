"""Chat router — AI-powered Q&A with streaming and summarization."""

import uuid
import json
import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.authz import assert_file_owner
from core.cache import cache_service
from core.security import get_current_user
from core.rate_limit import rate_limit
from core.config import settings
from core.usage_limits import usage_limiter
from models.database import get_db
from models.chat_message import ChatMessage
from models.file import File as FileModel
from services.ai_service import ai_service
from services.embedding_service import embedding_service
from services.storage_service import storage_service
from services.pdf_service import pdf_service

router = APIRouter()


class ChatRequest(BaseModel):
    question: str
    file_id: str
    deep_mode: bool = False
    model_id: str | None = None


class SummarizeRequest(BaseModel):
    file_id: str
    deep_mode: bool = False


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    createdAt: str


class ChatModelResponse(BaseModel):
    id: str
    name: str
    description: str
    creditCost: int
    reasoning: bool
    badge: str | None = None


class ChatCreditsResponse(BaseModel):
    used: int
    limit: int
    remaining: int


class DocumentTopicResponse(BaseModel):
    title: str
    page: int
    summary: str = ""


def _user_identity(user: dict) -> str:
    return user.get("email") or user.get("sub") or ""


def _available_chat_models() -> list[dict]:
    fast_cost = max(1, settings.CHAT_FAST_CREDIT_COST)
    deep_cost = max(fast_cost + 1, settings.CHAT_DEEP_CREDIT_COST)
    return [
        {
            "id": "gpt-oss-120b",
            "name": "GPT OSS 120B",
            "description": "Fast document Q&A for everyday questions.",
            "model": "gpt-oss-120b",
            "reasoning_effort": settings.CEREBRAS_CHAT_REASONING_EFFORT or settings.CEREBRAS_REASONING_EFFORT,
            "creditCost": fast_cost,
            "reasoning": False,
            "badge": "Fast",
        },
        {
            "id": "gemma-4-31b",
            "name": "Gemma 4 31B",
            "description": "Document and multimodal reasoning model.",
            "model": "gemma-4-31b",
            "reasoning_effort": settings.CEREBRAS_CHAT_REASONING_EFFORT or settings.CEREBRAS_REASONING_EFFORT,
            "creditCost": fast_cost,
            "reasoning": False,
            "badge": "Docs",
        },
        {
            "id": "zai-glm-4.7",
            "name": "GLM 4.7 Reasoning",
            "description": "Deep reasoning for harder questions.",
            "model": "zai-glm-4.7",
            "reasoning_effort": settings.CEREBRAS_DEEP_REASONING_EFFORT,
            "creditCost": deep_cost,
            "reasoning": True,
            "badge": "Deep",
        },
    ]


def _resolve_chat_model(model_id: str | None, deep_mode: bool) -> dict:
    models = _available_chat_models()
    fallback_id = settings.CEREBRAS_DEEP_MODEL if deep_mode else settings.CEREBRAS_CHAT_MODEL
    selected_id = model_id or fallback_id
    selected = next((model for model in models if model["id"] == selected_id or model["model"] == selected_id), None)
    if selected is None:
        raise HTTPException(status_code=400, detail=f"Unsupported model: {selected_id}")
    if deep_mode and not selected["reasoning"]:
        selected = {**selected, "reasoning": True, "reasoning_effort": settings.CEREBRAS_DEEP_REASONING_EFFORT}
        selected["creditCost"] = max(selected["creditCost"], settings.CHAT_DEEP_CREDIT_COST)
    return selected


async def _get_owned_file(file_id: str, user: dict, db: AsyncSession) -> FileModel:
    stmt = select(FileModel).where(FileModel.file_id == uuid.UUID(file_id))
    result = await db.execute(stmt)
    file_record = result.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    assert_file_owner(file_record, user)
    return file_record


async def _count_chats_today(created_by: str, db: AsyncSession) -> int:
    start_of_day = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    stmt = (
        select(func.count())
        .select_from(ChatMessage)
        .where(ChatMessage.created_by == created_by)
        .where(ChatMessage.role == "user")
        .where(ChatMessage.created_at >= start_of_day)
    )
    result = await db.execute(stmt)
    return result.scalar() or 0


async def _save_chat_pair(
    file_id: str,
    created_by: str,
    question: str,
    answer: str,
    db: AsyncSession,
) -> None:
    db.add_all(
        [
            ChatMessage(
                file_id=file_id,
                role="user",
                content=question,
                created_by=created_by,
            ),
            ChatMessage(
                file_id=file_id,
                role="assistant",
                content=answer,
                created_by=created_by,
            ),
        ]
    )
    await db.flush()
    await db.commit()


@router.get("/history/{file_id}", response_model=list[ChatMessageResponse])
async def get_chat_history(
    file_id: str,
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return saved chat history for the authenticated user and file."""
    await _get_owned_file(file_id, user, db)
    created_by = _user_identity(user)
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.file_id == file_id)
        .where(ChatMessage.created_by == created_by)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
    )
    result = await db.execute(stmt)
    return [
        {
            "id": str(message.id),
            "role": message.role,
            "content": message.content,
            "createdAt": message.created_at.isoformat() if message.created_at else "",
        }
        for message in result.scalars().all()
    ]


@router.get("/models")
async def get_chat_models():
    """Return chat models exposed in the DocWise model picker."""
    models = [
        {
            "id": model["id"],
            "name": model["name"],
            "description": model["description"],
            "creditCost": model["creditCost"],
            "reasoning": model["reasoning"],
            "badge": model["badge"],
        }
        for model in _available_chat_models()
    ]
    return JSONResponse(
        content=models,
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/credits", response_model=ChatCreditsResponse)
async def get_chat_credits(
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
):
    """Return today's LLM credit usage for the authenticated user."""
    created_by = _user_identity(user)
    limit = max(1, settings.LLM_DAILY_BUDGET_UNITS_PER_USER)
    used = await usage_limiter.get_daily_units(created_by, "chat")
    return {"used": used, "limit": limit, "remaining": max(0, limit - used)}


@router.get("/topics/{file_id}", response_model=list[DocumentTopicResponse])
async def get_document_topics(
    file_id: str,
    _: None = Depends(rate_limit("summarize")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate and cache a compact AI topic outline for PDF navigation."""
    file_record = await _get_owned_file(file_id, user, db)
    if file_record.file_type != "pdf":
        return []

    cache_key = f"chat:topics:{file_id}"
    cached_topics = await cache_service.get_json(cache_key)
    if cached_topics:
        return cached_topics

    file_bytes = storage_service.download_file(file_record.storage_key)
    pages = pdf_service.extract_pages(file_bytes)
    if not pages:
        return []

    excerpts = []
    for page in pages[:40]:
        text = str(page["text"]).replace("\n", " ").strip()
        excerpts.append(f"Page {page['page']}: {text[:1400]}")
    page_summaries = "\n\n".join(excerpts)

    try:
        topics = await ai_service.categorize_pdf_topics(page_summaries)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Topic generation failed: %s", exc)
        topics = []

    max_page = max(int(page["page"]) for page in pages)
    normalized_topics = [
        {
            "title": str(topic.get("title") or "Document").strip(),
            "page": min(max(int(topic.get("page") or 1), 1), max_page),
            "summary": str(topic.get("summary") or "").strip(),
        }
        for topic in topics
        if str(topic.get("title") or "").strip()
    ]

    if not normalized_topics:
        normalized_topics = [{"title": "Document start", "page": 1, "summary": ""}]

    await cache_service.set_json(
        cache_key,
        normalized_topics,
        ttl_seconds=settings.CACHE_TTL_SUMMARY_SECONDS,
    )
    return normalized_topics


@router.post("/ask")
async def chat_ask(
    body: ChatRequest,
    _: None = Depends(rate_limit("chat")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Ask a question about a file. Uses RAG: search similar chunks → LLM answer.
    Returns Server-Sent Events (SSE) stream.
    """
    await _get_owned_file(body.file_id, user, db)
    created_by = _user_identity(user)
    chats_today = await _count_chats_today(created_by, db)
    if chats_today >= settings.CHAT_DAILY_LIMIT_PER_USER:
        raise HTTPException(
            status_code=429,
            detail=f"Daily chat limit reached. You can ask up to {settings.CHAT_DAILY_LIMIT_PER_USER} questions per day.",
        )
    model_profile = _resolve_chat_model(body.model_id, body.deep_mode)
    try:
        await usage_limiter.consume_daily_units(created_by, "chat", model_profile["creditCost"])
    except HTTPException as exc:
        if exc.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail=(
                    "Daily credit limit reached. "
                    f"{model_profile['name']} costs {model_profile['creditCost']} credits."
                ),
            ) from exc
        raise

    cache_key = f"chat:ask:{body.file_id}:{model_profile['id']}:{model_profile['reasoning']}:{body.question.strip().lower()}"
    cached_response = await cache_service.get_json(cache_key)

    if cached_response:
        await _save_chat_pair(body.file_id, created_by, body.question, cached_response, db)

        async def cached_event_generator():
            yield f"data: {json.dumps({'text': cached_response})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            cached_event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )

    context_chunks = await asyncio.to_thread(
        embedding_service.search_similar,
        file_id=body.file_id,
        query=body.question,
        top_k=10,
    )

    async def event_generator():
        response_parts = []
        try:
            async for text_chunk in ai_service.chat_stream(
                question=body.question,
                context_chunks=context_chunks,
                deep_mode=model_profile["reasoning"],
                model=model_profile["model"],
                reasoning_effort=model_profile["reasoning_effort"],
            ):
                response_parts.append(text_chunk)
                data = json.dumps({"text": text_chunk})
                yield f"data: {data}\n\n"

            # Send timestamps from context if available
            timestamps = [
                {"start": c.get("start_time"), "end": c.get("end_time")}
                for c in context_chunks
                if c.get("start_time") is not None
            ]
            if timestamps:
                yield f"data: {json.dumps({'timestamps': timestamps})}\n\n"

            if response_parts:
                full_response = "".join(response_parts)
                await _save_chat_pair(body.file_id, created_by, body.question, full_response, db)
                await cache_service.set_json(
                    cache_key,
                    full_response,
                    ttl_seconds=settings.CACHE_TTL_CHAT_SECONDS,
                )

            yield "data: [DONE]\n\n"
        except Exception as e:
            import logging
            logging.getLogger(__name__).error("Chat stream error: %s", e, exc_info=True)
            yield f"data: {json.dumps({'error': 'An error occurred while generating the response.'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/summarize")
async def summarize_file(
    body: SummarizeRequest,
    _: None = Depends(rate_limit("summarize")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Summarize a file's content. Streams the summary via SSE.
    For PDFs: downloads and extracts text.
    For audio/video: uses stored transcript.
    """
    file_record = await _get_owned_file(body.file_id, user, db)

    # Get text content
    if file_record.file_type == "pdf":
        file_bytes = storage_service.download_file(file_record.storage_key)
        text = pdf_service.extract_full_text(file_bytes)
    else:
        text = file_record.transcript or ""

    if not text.strip():
        raise HTTPException(status_code=400, detail="No content available to summarize")

    # Truncate if very long (to stay within LLM context limits)
    max_chars = 50000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[Content truncated due to length...]"

    cache_key = f"chat:summarize:{body.file_id}"
    cached_summary = await cache_service.get_json(cache_key)

    if cached_summary:
        async def cached_event_generator():
            yield f"data: {json.dumps({'text': cached_summary})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            cached_event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )

    async def event_generator():
        summary_parts = []
        try:
            async for chunk in ai_service.summarize_stream(text, deep_mode=body.deep_mode):
                summary_parts.append(chunk)
                data = json.dumps({"text": chunk})
                yield f"data: {data}\n\n"

            if summary_parts:
                await cache_service.set_json(
                    cache_key,
                    "".join(summary_parts),
                    ttl_seconds=settings.CACHE_TTL_SUMMARY_SECONDS,
                )

            yield "data: [DONE]\n\n"
        except Exception as e:
            import logging
            logging.getLogger(__name__).error("Summarize stream error: %s", e, exc_info=True)
            yield f"data: {json.dumps({'error': 'An error occurred while generating the summary.'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
