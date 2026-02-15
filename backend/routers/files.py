"""Files router — upload, retrieve, list, and delete files."""

import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.authz import assert_file_owner
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
    email = user.get("email", "")
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
    # ── Daily upload limit check ──────────────────────────────────────────
    created_by_email = user.get("email") or ""
    today_count = await _count_uploads_today(created_by_email, db)
    if today_count >= settings.MAX_FILES_PER_USER_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily upload limit reached. You can upload up to {settings.MAX_FILES_PER_USER_PER_DAY} files per day.",
        )

    content_type = file.content_type or "application/octet-stream"
    file_type = _classify_file(content_type)
    file_bytes = await file.read()

    # ── Server-side file size enforcement ────────────────────────────────
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    file_id = str(uuid.uuid4())
    original_name = file_name or file.filename or "untitled"
    storage_key = f"{file_type}/{file_id}/{original_name}"

    # Upload to MinIO
    storage_service.upload_file(file_bytes, storage_key, content_type)

    # Create database record with status='processing'
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

    # Dispatch background task based on file type
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

    # Get timestamps if media file
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

    email = user["email"]
    stmt = (
        select(FileModel)
        .where(FileModel.created_by == email)
        .order_by(FileModel.created_at.desc())
    )
    result = await db.execute(stmt)
    files = result.scalars().all()

    file_list = []
    public_base_url = _external_base_url(request)
    for f in files:
        file_url = storage_service.get_presigned_url(
            f.storage_key,
            public_base_url=public_base_url,
        )
        file_list.append(
            {
                "fileId": str(f.file_id),
                "fileName": f.file_name,
                "fileType": f.file_type,
                "fileUrl": file_url,
                "status": f.status,
                "createdAt": f.created_at.isoformat() if f.created_at else None,
            }
        )

    return file_list


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

    # Delete from MinIO
    storage_service.delete_file(file_record.storage_key)

    # Delete FAISS index
    from vector_store.faiss_index import faiss_index
    faiss_index.delete_index(file_id)

    # Delete timestamps
    ts_stmt = select(MediaTimestamp).where(MediaTimestamp.file_id == uuid.UUID(file_id))
    ts_result = await db.execute(ts_stmt)
    for ts in ts_result.scalars().all():
        await db.delete(ts)

    # Delete file record
    await db.delete(file_record)

    return {"status": "deleted"}
