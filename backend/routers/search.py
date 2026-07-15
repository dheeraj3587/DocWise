"""Search router — vector similarity search across file embeddings."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.authz import assert_file_owner
from core.cache import cache_service
from core.config import settings
from core.rate_limit import rate_limit
from core.security import get_current_user
from models.database import get_db
from models.file import File as FileModel
from services.embedding_service import embedding_service
from services.document_index_service import document_index_service

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    file_id: str
    top_k: int = 5


@router.post("")
async def search_documents(
    body: SearchRequest,
    _: None = Depends(rate_limit("search")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Search for similar chunks in a file's vector index.
    Returns ranked results with text, score, and optional timestamps.
    """
    # Ownership check — verify the user owns this file
    stmt = select(FileModel).where(FileModel.file_id == uuid.UUID(body.file_id))
    result = await db.execute(stmt)
    file_record = result.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    assert_file_owner(file_record, user)
    owner_sub = (user.get("sub") or "").strip()
    if not owner_sub:
        raise HTTPException(status_code=401, detail="Missing Clerk subject")
    if not file_record.owner_sub:
        file_record.owner_sub = owner_sub

    if not body.query.strip():
        return []

    cache_key = (
        f"search:{owner_sub}:{body.file_id}:{file_record.embedding_version or 'legacy'}:"
        f"{body.top_k}:{body.query.strip().lower()}"
    )
    cached = await cache_service.get_json(cache_key)
    if cached is not None:
        return cached

    results = await document_index_service.search(
        db,
        owner_sub=owner_sub,
        file_ids=[file_record.file_id],
        query=body.query,
        limit=body.top_k,
    )
    if not results and settings.LEGACY_FAISS_DUAL_WRITE:
        results = embedding_service.search_similar(
            file_id=body.file_id,
            query=body.query,
            top_k=body.top_k,
        )

    response = [
        {
            "text": r.get("text", ""),
            "score": r.get("score", 0.0),
            "startTime": r.get("start_time"),
            "endTime": r.get("end_time"),
            "fileId": r.get("file_id"),
            "pageStart": r.get("page_start"),
            "pageEnd": r.get("page_end"),
            "chunkId": r.get("id"),
        }
        for r in results
    ]

    await cache_service.set_json(
        cache_key,
        response,
        ttl_seconds=settings.CACHE_TTL_SEARCH_SECONDS,
    )
    return response
