"""Transactional document chunk persistence and hybrid retrieval."""

from __future__ import annotations

import asyncio
import hashlib
import math
import uuid
from collections import defaultdict
from typing import Any, Iterable

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.conversation import DocumentChunk
from models.file import File
from services.embedding_service import embedding_service


_CHUNK_NAMESPACE = uuid.UUID("66db4ad8-502f-4a7a-a254-7feaa5a41e53")


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _chunk_id(file_id: uuid.UUID, version: str, ordinal: int, digest: str) -> uuid.UUID:
    return uuid.uuid5(_CHUNK_NAMESPACE, f"{file_id}:{version}:{ordinal}:{digest}")


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)


class DocumentIndexService:
    """Stores embeddings in PostgreSQL and retrieves diverse hybrid results."""

    async def replace_chunks(
        self,
        db: AsyncSession,
        file_record: File,
        chunks: list[dict[str, Any]],
        *,
        embedding_version: str | None = None,
    ) -> int:
        version = embedding_version or settings.EMBEDDING_VERSION
        texts = [str(chunk.get("text") or "").strip() for chunk in chunks]
        normalized = [
            (chunk, text)
            for chunk, text in zip(chunks, texts)
            if text
        ]
        if not normalized:
            await db.execute(
                delete(DocumentChunk).where(DocumentChunk.file_id == file_record.file_id)
            )
            file_record.embedding_version = version
            return 0

        embeddings = await asyncio.to_thread(
            embedding_service.embed_texts,
            [text for _, text in normalized],
        )
        owner_sub = (file_record.owner_sub or "").strip()
        if not owner_sub:
            raise ValueError("Cannot index a file without a canonical owner_sub")

        await db.execute(
            delete(DocumentChunk).where(DocumentChunk.file_id == file_record.file_id)
        )

        for position, ((metadata, text), embedding) in enumerate(zip(normalized, embeddings)):
            ordinal = int(metadata.get("ordinal", position))
            digest = _content_hash(text)
            db.add(
                DocumentChunk(
                    id=_chunk_id(file_record.file_id, version, ordinal, digest),
                    file_id=file_record.file_id,
                    owner_sub=owner_sub,
                    ordinal=ordinal,
                    text=text,
                    search_text=text,
                    page_start=metadata.get("page_start"),
                    page_end=metadata.get("page_end"),
                    character_start=metadata.get("character_start"),
                    character_end=metadata.get("character_end"),
                    start_time=metadata.get("start_time"),
                    end_time=metadata.get("end_time"),
                    content_hash=digest,
                    embedding_model=settings.LOCAL_EMBEDDING_MODEL,
                    embedding_version=version,
                    embedding=embedding,
                )
            )

        file_record.embedding_version = version
        await db.flush()
        return len(normalized)

    async def search(
        self,
        db: AsyncSession,
        *,
        owner_sub: str,
        file_ids: Iterable[uuid.UUID],
        query: str,
        limit: int | None = None,
        candidates: int | None = None,
    ) -> list[dict[str, Any]]:
        selected_file_ids = list(dict.fromkeys(file_ids))
        if not selected_file_ids or not query.strip():
            return []

        result_limit = max(1, limit or settings.CHAT_RETRIEVAL_LIMIT)
        candidate_limit = max(result_limit, candidates or settings.CHAT_RETRIEVAL_CANDIDATES)
        query_embedding = await asyncio.to_thread(embedding_service.embed_query, query)
        dialect = db.get_bind().dialect.name

        if dialect == "postgresql":
            ranked = await self._search_postgres(
                db,
                owner_sub=owner_sub,
                file_ids=selected_file_ids,
                query=query,
                query_embedding=query_embedding,
                candidate_limit=candidate_limit,
            )
        else:
            ranked = await self._search_portable(
                db,
                owner_sub=owner_sub,
                file_ids=selected_file_ids,
                query=query,
                query_embedding=query_embedding,
                candidate_limit=candidate_limit,
            )

        return self._diversify(ranked, result_limit)

    async def _search_postgres(
        self,
        db: AsyncSession,
        *,
        owner_sub: str,
        file_ids: list[uuid.UUID],
        query: str,
        query_embedding: list[float],
        candidate_limit: int,
    ) -> list[dict[str, Any]]:
        distance = DocumentChunk.embedding.cosine_distance(query_embedding).label("distance")
        base_filters = (
            DocumentChunk.owner_sub == owner_sub,
            DocumentChunk.file_id.in_(file_ids),
        )
        vector_rows = (
            await db.execute(
                select(DocumentChunk, distance)
                .where(*base_filters)
                .order_by(distance.asc())
                .limit(candidate_limit)
            )
        ).all()

        lex_rank = func.ts_rank_cd(
            func.to_tsvector("english", DocumentChunk.search_text),
            func.plainto_tsquery("english", query),
        ).label("lex_rank")
        lexical_rows = (
            await db.execute(
                select(DocumentChunk, lex_rank)
                .where(*base_filters)
                .where(lex_rank > 0)
                .order_by(lex_rank.desc())
                .limit(candidate_limit)
            )
        ).all()

        return self._rrf(vector_rows, lexical_rows, vector_is_distance=True)

    async def _search_portable(
        self,
        db: AsyncSession,
        *,
        owner_sub: str,
        file_ids: list[uuid.UUID],
        query: str,
        query_embedding: list[float],
        candidate_limit: int,
    ) -> list[dict[str, Any]]:
        chunks = (
            await db.execute(
                select(DocumentChunk).where(
                    DocumentChunk.owner_sub == owner_sub,
                    DocumentChunk.file_id.in_(file_ids),
                )
            )
        ).scalars().all()
        query_terms = {term for term in query.lower().split() if len(term) > 2}

        vector_rows = sorted(
            ((chunk, _cosine_similarity(chunk.embedding, query_embedding)) for chunk in chunks),
            key=lambda item: item[1],
            reverse=True,
        )[:candidate_limit]
        lexical_rows = sorted(
            (
                (chunk, sum(chunk.search_text.lower().count(term) for term in query_terms))
                for chunk in chunks
            ),
            key=lambda item: item[1],
            reverse=True,
        )[:candidate_limit]
        lexical_rows = [row for row in lexical_rows if row[1] > 0]
        return self._rrf(vector_rows, lexical_rows, vector_is_distance=False)

    @staticmethod
    def _rrf(
        vector_rows: list[tuple[DocumentChunk, float]],
        lexical_rows: list[tuple[DocumentChunk, float]],
        *,
        vector_is_distance: bool,
    ) -> list[dict[str, Any]]:
        scores: dict[uuid.UUID, float] = defaultdict(float)
        chunks: dict[uuid.UUID, DocumentChunk] = {}
        vector_values: dict[uuid.UUID, float] = {}

        for rank, (chunk, value) in enumerate(vector_rows, start=1):
            chunks[chunk.id] = chunk
            vector_values[chunk.id] = float(value)
            scores[chunk.id] += 1.0 / (60 + rank)
        for rank, (chunk, _) in enumerate(lexical_rows, start=1):
            chunks[chunk.id] = chunk
            scores[chunk.id] += 1.0 / (60 + rank)

        ranked = []
        for chunk_id, score in sorted(scores.items(), key=lambda item: item[1], reverse=True):
            chunk = chunks[chunk_id]
            raw_vector = vector_values.get(chunk_id, 0.0)
            similarity = 1.0 - raw_vector if vector_is_distance else raw_vector
            ranked.append(
                {
                    "id": str(chunk.id),
                    "file_id": str(chunk.file_id),
                    "text": chunk.text,
                    "page_start": chunk.page_start,
                    "page_end": chunk.page_end,
                    "start_time": chunk.start_time,
                    "end_time": chunk.end_time,
                    "score": float(score),
                    "similarity": float(similarity),
                    "ordinal": chunk.ordinal,
                }
            )
        return ranked

    @staticmethod
    def _diversify(ranked: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
        per_file_cap = max(2, math.ceil(limit / max(1, len({r["file_id"] for r in ranked}))))
        per_file: dict[str, int] = defaultdict(int)
        selected: list[dict[str, Any]] = []
        deferred: list[dict[str, Any]] = []

        for candidate in ranked:
            file_id = candidate["file_id"]
            if per_file[file_id] >= per_file_cap:
                deferred.append(candidate)
                continue
            candidate["rank"] = len(selected) + 1
            selected.append(candidate)
            per_file[file_id] += 1
            if len(selected) == limit:
                return selected

        for candidate in deferred:
            candidate["rank"] = len(selected) + 1
            selected.append(candidate)
            if len(selected) == limit:
                break
        return selected


document_index_service = DocumentIndexService()
