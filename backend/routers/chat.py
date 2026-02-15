"""Chat router — AI-powered Q&A with streaming and summarization."""

import uuid
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.authz import assert_file_owner
from core.cache import cache_service
from core.security import get_current_user
from core.rate_limit import rate_limit
from core.config import settings
from models.database import get_db
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


class SummarizeRequest(BaseModel):
    file_id: str
    deep_mode: bool = False


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
    # Ownership check — verify the user owns this file
    stmt = select(FileModel).where(FileModel.file_id == uuid.UUID(body.file_id))
    result = await db.execute(stmt)
    file_record = result.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    assert_file_owner(file_record, user)

    cache_key = f"chat:ask:{body.file_id}:{body.question.strip().lower()}"
    cached_response = await cache_service.get_json(cache_key)

    if cached_response:
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

    # Search for relevant context
    context_chunks = embedding_service.search_similar(
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
                deep_mode=body.deep_mode,
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
    stmt = select(FileModel).where(FileModel.file_id == uuid.UUID(body.file_id))
    result = await db.execute(stmt)
    file_record = result.scalar_one_or_none()

    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    # Ownership check — verify the user owns this file
    assert_file_owner(file_record, user)

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
