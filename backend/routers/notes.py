"""Notes router — CRUD for workspace notes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.authz import assert_file_owner
from core.rate_limit import rate_limit
from core.security import get_current_user
from models.database import get_db
from models.file import File as FileModel
from models.note import Note

router = APIRouter()


class NoteUpdate(BaseModel):
    note: str


async def _get_owned_file(file_id: str, user: dict, db: AsyncSession) -> FileModel:
    """Look up a file and verify the current user owns it."""
    stmt = select(FileModel).where(FileModel.file_id == uuid.UUID(file_id))
    result = await db.execute(stmt)
    file_record = result.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    assert_file_owner(file_record, user)
    return file_record


@router.get("/{file_id}")
async def get_notes(
    file_id: str,
    _: None = Depends(rate_limit("notes")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get notes for a file (owner only)."""
    await _get_owned_file(file_id, user, db)

    stmt = select(Note).where(Note.file_id == uuid.UUID(file_id))
    result = await db.execute(stmt)
    notes = result.scalars().all()

    return [
        {
            "id": n.id,
            "fileId": str(n.file_id),
            "note": n.note,
            "createdBy": n.created_by,
            "updatedAt": n.updated_at.isoformat() if n.updated_at else None,
        }
        for n in notes
    ]


@router.put("/{file_id}")
async def save_note(
    file_id: str,
    body: NoteUpdate,
    _: None = Depends(rate_limit("notes")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update a note for a file (upsert, owner only)."""
    await _get_owned_file(file_id, user, db)

    stmt = select(Note).where(Note.file_id == uuid.UUID(file_id))
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    created_by = user.get("email") or user.get("sub") or ""

    if existing:
        existing.note = body.note
        existing.created_by = created_by
    else:
        new_note = Note(
            file_id=uuid.UUID(file_id),
            note=body.note,
            created_by=created_by,
        )
        db.add(new_note)

    return {"status": "saved"}


@router.delete("/{file_id}")
async def delete_note(
    file_id: str,
    _: None = Depends(rate_limit("notes")),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete notes for a file (owner only)."""
    await _get_owned_file(file_id, user, db)

    stmt = select(Note).where(Note.file_id == uuid.UUID(file_id))
    result = await db.execute(stmt)
    notes = result.scalars().all()

    for note in notes:
        await db.delete(note)

    return {"status": "deleted"}
