"""Files router — upload, retrieve, list, and delete files."""

import uuid
import re
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, Request, status
from sqlalchemy import delete as sa_delete, or_, select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.authz import assert_file_owner
from core.cache import cache_service
from core.config import settings
from core.rate_limit import rate_limit
from core.security import get_current_user
from models.database import get_db
from models.file import File as FileModel
from models.timestamp import MediaTimestamp
from models.conversation import (
    DocumentChunk,
    MessageCitation,
    OutboxEvent,
    ProcessingJob,
)
from services.storage_service import storage_service
from tasks.celery_worker import dispatch_outbox

router = APIRouter()
logger = logging.getLogger(__name__)

# Allowed MIME types
PDF_TYPES = {"application/pdf"}
AUDIO_TYPES = {"audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/webm", "audio/ogg"}
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/ogg"}


def _safe_storage_name(file_name: str) -> str:
    """Make object keys proxy/signature friendly while preserving display names in DB."""
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", file_name).strip("._")
    return safe_name or "file"


def _classify_file(content_type: str) -> str:
    """Classify uploaded file as pdf, audio, or video."""
    if content_type in PDF_TYPES:
        return "pdf"
    if content_type in AUDIO_TYPES:
        return "audio"
    if content_type in VIDEO_TYPES:
        return "video"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported file type: {content_type}. Allowed: PDF, audio, video.",
    )


def _external_base_url(request: Optional[Request]) -> Optional[str]:
    """Build external base URL, honoring reverse-proxy forwarded headers."""
    if request is None:
        return None
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.netloc
    )
    return f"{scheme}://{host}"


async def _count_uploads_today(owner_sub: str, email: str, db: AsyncSession) -> int:
    """Count files uploaded by a user in the current UTC day."""
    start_of_day = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    stmt = (
        select(func.count())
        .select_from(FileModel)
        .where(
            or_(
                FileModel.owner_sub == owner_sub,
                FileModel.created_by == email,
            )
        )
        .where(FileModel.created_at >= start_of_day)
    )
    result = await db.execute(stmt)
    return result.scalar() or 0


@router.get("/upload-count")
async def get_upload_count(
    _: None = Depends(rate_limit("default")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return how many files the user has uploaded today and the daily limit."""
    owner_sub = user.get("sub") or ""
    email = (user.get("email") or "").strip().lower()
    count = await _count_uploads_today(owner_sub, email, db)
    limit = settings.MAX_FILES_PER_USER_PER_DAY
    return {"count": count, "limit": limit, "remaining": max(0, limit - count)}


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_name: str = Form(None),
    _: None = Depends(rate_limit("upload")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a PDF, audio, or video file.
    Processing (parsing/transcription/embedding) happens in the background via Celery.
    Limited to MAX_FILES_PER_USER_PER_DAY uploads per user per UTC day.
    """
    owner_sub = (user.get("sub") or "").strip()
    if not owner_sub:
        raise HTTPException(status_code=401, detail="Missing Clerk subject")
    created_by_email = (user.get("email") or owner_sub).strip().lower()
    today_count = await _count_uploads_today(owner_sub, created_by_email, db)
    if today_count >= settings.MAX_FILES_PER_USER_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily upload limit reached. You can upload up to {settings.MAX_FILES_PER_USER_PER_DAY} files per day.",
        )

    content_type = file.content_type or "application/octet-stream"
    file_type = _classify_file(content_type)
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    digest = hashlib.sha256()
    size_bytes = 0
    while chunk := await file.read(1024 * 1024):
        size_bytes += len(chunk)
        if size_bytes > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE_MB} MB.",
            )
        digest.update(chunk)
    await file.seek(0)

    file_id = str(uuid.uuid4())
    original_name = (file_name or "").strip() or file.filename or "untitled"
    storage_key = f"{file_type}/{file_id}/{_safe_storage_name(original_name)}"

    try:
        storage_service.upload_stream(
            file.file,
            storage_key,
            content_type,
            size_bytes,
        )
    except Exception as exc:
        logger.error("Object upload failed for %s: %s", file_id, exc, exc_info=True)
        raise HTTPException(status_code=503, detail="File storage is temporarily unavailable") from exc

    file_record = FileModel(
        file_id=uuid.UUID(file_id),
        file_name=original_name,
        file_type=file_type,
        storage_key=storage_key,
        created_by=created_by_email,
        owner_sub=owner_sub,
        mime_type=content_type,
        checksum_sha256=digest.hexdigest(),
        size_bytes=size_bytes,
        status="processing",
    )
    db.add(file_record)
    await db.flush()

    job = ProcessingJob(
        file_id=file_record.file_id,
        kind=f"process_{file_type}",
        version=settings.EMBEDDING_VERSION,
        status="queued",
        phase="Queued for processing",
        progress=1,
    )
    db.add(job)
    await db.flush()
    db.add(
        OutboxEvent(
            event_type="file.process",
            aggregate_id=file_id,
            payload={
                "fileId": file_id,
                "storageKey": storage_key,
                "fileName": original_name,
                "fileType": file_type,
                "jobId": str(job.id),
            },
        )
    )

    await cache_service.set_json(
        f"files:progress:{file_id}",
        {
            "fileId": file_id,
            "status": "processing",
            "phase": "Queued for processing",
            "progress": 1,
        },
        ttl_seconds=60 * 60 * 24,
    )

    try:
        await db.commit()
    except Exception:
        try:
            storage_service.delete_file(storage_key)
        except Exception:
            logger.exception("Failed to compensate object upload for %s", storage_key)
        raise

    try:
        dispatch_outbox.delay()
    except Exception:
        # The durable outbox is also polled by Celery beat.
        logger.warning("Immediate outbox wake-up failed for %s", file_id, exc_info=True)

    return {
        "fileId": file_id,
        "fileName": original_name,
        "fileType": file_type,
        "status": "processing",
    }


@router.get("/{file_id}/progress")
async def get_file_progress(
    file_id: str,
    _: None = Depends(rate_limit("default")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return real processing progress for a file."""
    stmt = select(FileModel).where(FileModel.file_id == uuid.UUID(file_id))
    result = await db.execute(stmt)
    file_record = result.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    assert_file_owner(file_record, user)

    job = (
        await db.execute(
            select(ProcessingJob)
            .where(ProcessingJob.file_id == file_record.file_id)
            .order_by(ProcessingJob.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if job:
        return {
            "fileId": file_id,
            "status": file_record.status,
            "phase": job.phase,
            "progress": job.progress,
            "attempts": job.attempts,
            "error": job.error_detail,
        }

    cached = await cache_service.get_json(f"files:progress:{file_id}")
    if cached:
        return cached

    if file_record.status == "ready":
        return {
            "fileId": file_id,
            "status": "ready",
            "phase": "Ready",
            "progress": 100,
        }
    if file_record.status == "failed":
        return {
            "fileId": file_id,
            "status": "failed",
            "phase": "Processing failed",
            "progress": 100,
        }
    return {
        "fileId": file_id,
        "status": file_record.status,
        "phase": "Processing",
        "progress": 1,
    }


@router.get("/{file_id}")
async def get_file(
    file_id: str,
    _: None = Depends(rate_limit("default")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Get file metadata and a presigned download URL."""
    if not hasattr(db, "execute") and request is not None and hasattr(request, "execute"):
        db, request = request, None

    stmt = select(FileModel).where(FileModel.file_id == uuid.UUID(file_id))
    result = await db.execute(stmt)
    file_record = result.scalar_one_or_none()

    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    # Ownership check — only the file owner can access it
    assert_file_owner(file_record, user)
    if not file_record.owner_sub:
        file_record.owner_sub = user.get("sub")

    file_url = storage_service.get_presigned_url(
        file_record.storage_key,
        public_base_url=_external_base_url(request),
    )

    timestamps = []
    if file_record.file_type in ("audio", "video"):
        ts_stmt = select(MediaTimestamp).where(
            MediaTimestamp.file_id == uuid.UUID(file_id)
        )
        ts_result = await db.execute(ts_stmt)
        timestamps = [
            {
                "id": ts.id,
                "start_time": ts.start_time,
                "end_time": ts.end_time,
                "text": ts.text,
                "topic": ts.topic,
            }
            for ts in ts_result.scalars().all()
        ]

    return {
        "fileId": str(file_record.file_id),
        "fileName": file_record.file_name,
        "fileType": file_record.file_type,
        "fileUrl": file_url,
        "status": file_record.status,
        "transcript": file_record.transcript,
        "durationSeconds": file_record.duration_seconds,
        "timestamps": timestamps,
        "createdAt": file_record.created_at.isoformat() if file_record.created_at else None,
    }


@router.get("")
async def list_files(
    _: None = Depends(rate_limit("default")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """List files for the authenticated user."""
    if not hasattr(db, "execute") and request is not None and hasattr(request, "execute"):
        db, request = request, None

    identifiers = []
    email = (user.get("email") or "").strip().lower()
    sub = (user.get("sub") or "").strip()
    if email:
        identifiers.append(FileModel.created_by == email)
    if sub:
        identifiers.append(FileModel.owner_sub == sub)
        identifiers.append(FileModel.created_by == sub)

    stmt = (
        select(FileModel)
        .where(or_(*identifiers))
        .order_by(FileModel.created_at.desc())
    )
    result = await db.execute(stmt)
    files = result.scalars().all()

    import asyncio

    public_base_url = _external_base_url(request)

    async def _build_file_entry(f):
        file_url = await asyncio.to_thread(
            storage_service.get_presigned_url,
            f.storage_key,
            public_base_url=public_base_url,
        )
        return {
            "fileId": str(f.file_id),
            "fileName": f.file_name,
            "fileType": f.file_type,
            "fileUrl": file_url,
            "status": f.status,
            "createdAt": f.created_at.isoformat() if f.created_at else None,
        }

    file_list = await asyncio.gather(*[_build_file_entry(f) for f in files])
    return list(file_list)


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    _: None = Depends(rate_limit("default")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a file and its associated data."""
    stmt = select(FileModel).where(FileModel.file_id == uuid.UUID(file_id))
    result = await db.execute(stmt)
    file_record = result.scalar_one_or_none()

    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    # Ownership check — only JWT identity (email or sub) is trusted
    assert_file_owner(file_record, user)

    await db.execute(
        update(MessageCitation)
        .where(MessageCitation.source_file_id == file_record.file_id)
        .values(
            chunk_id=None,
            source_file_id=None,
            excerpt=None,
            source_removed=True,
        )
    )
    await db.execute(
        sa_delete(DocumentChunk).where(DocumentChunk.file_id == file_record.file_id)
    )

    try:
        storage_service.delete_file(file_record.storage_key)
    except Exception:
        db.add(
            OutboxEvent(
                event_type="storage.delete",
                aggregate_id=file_id,
                payload={"storageKey": file_record.storage_key},
            )
        )

    if settings.LEGACY_FAISS_DUAL_WRITE:
        from vector_store.faiss_index import faiss_index
        faiss_index.delete_index(file_id)

    from models.chat_message import ChatMessage

    await db.execute(
        sa_delete(MediaTimestamp).where(MediaTimestamp.file_id == uuid.UUID(file_id))
    )
    await db.execute(
        sa_delete(ChatMessage).where(ChatMessage.file_id == file_id)
    )

    await db.delete(file_record)
    await db.commit()

    try:
        dispatch_outbox.delay()
    except Exception:
        logger.warning("Cleanup outbox wake-up failed for %s", file_id, exc_info=True)

    return {"status": "deleted"}
