"""Files router — upload, retrieve, list, and delete files."""

import uuid
import re
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.authz import assert_file_owner
from core.cache import cache_service
from core.config import settings
from core.rate_limit import rate_limit
from core.security import get_current_user
from models.database import get_db
from models.file import File as FileModel
from models.timestamp import MediaTimestamp
from services.storage_service import storage_service
from tasks.celery_worker import process_pdf, process_media

router = APIRouter()

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


async def _count_uploads_today(email: str, db: AsyncSession) -> int:
    """Count files uploaded by a user in the current UTC day."""
    start_of_day = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    stmt = (
        select(func.count())
        .select_from(FileModel)
        .where(FileModel.created_by == email)
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
    email = user.get("email") or user.get("sub") or ""
    count = await _count_uploads_today(email, db)
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
    created_by_email = user.get("email") or user.get("sub") or ""
    today_count = await _count_uploads_today(created_by_email, db)
    if today_count >= settings.MAX_FILES_PER_USER_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily upload limit reached. You can upload up to {settings.MAX_FILES_PER_USER_PER_DAY} files per day.",
        )

    content_type = file.content_type or "application/octet-stream"
    file_type = _classify_file(content_type)
    file_bytes = await file.read()

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    file_id = str(uuid.uuid4())
    original_name = (file_name or "").strip() or file.filename or "untitled"
    storage_key = f"{file_type}/{file_id}/{_safe_storage_name(original_name)}"

    storage_service.upload_file(file_bytes, storage_key, content_type)

    file_record = FileModel(
        file_id=uuid.UUID(file_id),
        file_name=original_name,
        file_type=file_type,
        storage_key=storage_key,
        created_by=created_by_email,
        status="processing",
    )
    db.add(file_record)
    await db.flush()

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

    if file_type == "pdf":
        process_pdf.delay(file_id, storage_key)
    else:
        process_media.delay(file_id, storage_key, original_name)

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

    # Match files by email OR sub (Clerk user ID) so files created
    # before the email-fix are still returned.
    from sqlalchemy import or_
    identifiers = []
    email = (user.get("email") or "").strip().lower()
    sub = (user.get("sub") or "").strip()
    if email:
        identifiers.append(FileModel.created_by == email)
    if sub:
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

    storage_service.delete_file(file_record.storage_key)

    from vector_store.faiss_index import faiss_index
    faiss_index.delete_index(file_id)

    from sqlalchemy import delete as sa_delete
    from models.chat_message import ChatMessage

    await db.execute(
        sa_delete(MediaTimestamp).where(MediaTimestamp.file_id == uuid.UUID(file_id))
    )
    await db.execute(
        sa_delete(ChatMessage).where(ChatMessage.file_id == file_id)
    )

    await db.delete(file_record)

    return {"status": "deleted"}
