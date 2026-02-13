"""Search router — vector similarity search across file embeddings."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.cache import cache_service
from core.config import settings
from core.rate_limit import rate_limit
from core.security import get_current_user
from services.embedding_service import embedding_service

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
):
    """
    Search for similar chunks in a file's vector index.
    Returns ranked results with text, score, and optional timestamps.
    """
    if not body.query.strip():
        return []

    cache_key = f"search:{body.file_id}:{body.top_k}:{body.query.strip().lower()}"
    cached = await cache_service.get_json(cache_key)
    if cached is not None:
        return cached

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
        }
        for r in results
    ]

    await cache_service.set_json(
        cache_key,
        response,
        ttl_seconds=settings.CACHE_TTL_SEARCH_SECONDS,
    )
    return response
