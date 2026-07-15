"""Users router — user creation and management."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.rate_limit import rate_limit
from core.security import get_current_user
from models.conversation import OutboxEvent, ProcessingJob
from models.database import get_db
from models.user import User
from models.file import File

router = APIRouter()


class UserCreate(BaseModel):
    email: str
    name: str
    image_url: str | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    image_url: str | None = None


async def _claim_and_queue_legacy_files(
    db: AsyncSession,
    *,
    email: str,
    owner_sub: str | None,
) -> int:
    """Claim email-owned files and durably queue any that need pgvector indexing."""
    if not owner_sub:
        return 0

    files = (
        await db.execute(
            select(File).where(File.owner_sub.is_(None), File.created_by == email)
        )
    ).scalars().all()
    queued = 0
    for file_record in files:
        file_record.owner_sub = owner_sub
        if (
            file_record.status != "ready"
            or file_record.embedding_version == settings.EMBEDDING_VERSION
        ):
            continue

        kind = f"reindex_{file_record.file_type}"
        job = (
            await db.execute(
                select(ProcessingJob).where(
                    ProcessingJob.file_id == file_record.file_id,
                    ProcessingJob.kind == kind,
                    ProcessingJob.version == settings.EMBEDDING_VERSION,
                )
            )
        ).scalar_one_or_none()
        if job and job.status in {"queued", "running", "retrying"}:
            continue
        if job is None:
            job = ProcessingJob(
                file_id=file_record.file_id,
                kind=kind,
                version=settings.EMBEDDING_VERSION,
            )
            db.add(job)
            await db.flush()
        else:
            job.status = "queued"
            job.phase = "Queued after ownership migration"
            job.progress = 0
            job.error_code = None
            job.error_detail = None
            job.completed_at = None

        db.add(
            OutboxEvent(
                event_type="file.process",
                aggregate_id=str(file_record.file_id),
                payload={
                    "fileId": str(file_record.file_id),
                    "storageKey": file_record.storage_key,
                    "fileName": file_record.file_name,
                    "fileType": file_record.file_type,
                    "jobId": str(job.id),
                },
            )
        )
        queued += 1
    return queued


@router.post("")
async def create_user(
    body: UserCreate,
    _: None = Depends(rate_limit("users")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user profile (only for the authenticated user)."""
    # Enforce that users can only create their own profile.
    # Clerk JWTs may not include the email claim by default;
    # if the JWT has an email, it must match the body email.
    # If the JWT has no email (empty), allow it — the user is already
    # authenticated via a valid JWT so we trust the body email.
    jwt_email = (user.get("email") or "").strip().lower()
    body_email = (body.email or "").strip().lower()
    if jwt_email and jwt_email != body_email:
        raise HTTPException(status_code=403, detail="You can only create your own profile")

    stmt = select(User).where(User.email == body_email)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.clerk_sub = user.get("sub") or existing.clerk_sub
        await _claim_and_queue_legacy_files(
            db,
            email=body_email,
            owner_sub=user.get("sub"),
        )
        return {"status": "exists", "email": existing.email}

    new_user = User(
        clerk_sub=user.get("sub"),
        email=body_email,
        name=body.name,
        image_url=body.image_url,
    )
    db.add(new_user)
    await _claim_and_queue_legacy_files(
        db,
        email=body_email,
        owner_sub=user.get("sub"),
    )

    return {"status": "created", "email": body_email}


@router.get("/me")
async def get_me(
    _: None = Depends(rate_limit("users")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user data."""
    email = user.get("email") or ""
    if not email:
        # JWT has no email claim; return basic info from token
        return {"email": "", "name": user.get("name", "")}

    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    db_user = result.scalar_one_or_none()

    if not db_user:
        return {"email": email, "name": user.get("name", "")}

    return {
        "email": db_user.email,
        "name": db_user.name,
        "imageUrl": db_user.image_url,
    }


@router.patch("/{email}")
async def update_user(
    email: str,
    body: UserUpdate,
    _: None = Depends(rate_limit("users")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user fields (name, image). Users can only update their own profile."""
    # Enforce self-only access (skip check if JWT has no email claim)
    jwt_email = (user.get("email") or "").strip().lower()
    target_email = (email or "").strip().lower()
    if jwt_email and jwt_email != target_email:
        raise HTTPException(status_code=403, detail="You can only update your own profile")

    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    db_user = result.scalar_one_or_none()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.name is not None:
        db_user.name = body.name
    if body.image_url is not None:
        db_user.image_url = body.image_url

    return {"status": "updated"}
