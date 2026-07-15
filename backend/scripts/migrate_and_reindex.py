"""Backfill canonical owners, migrate legacy chats, and queue resumable reindexing."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid

from sqlalchemy import or_, select


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from core.config import settings  # noqa: E402
from models.chat_message import ChatMessage  # noqa: E402
from models.conversation import (  # noqa: E402
    Conversation,
    ConversationDocument,
    ConversationMessage,
    OutboxEvent,
    ProcessingJob,
)
from models.database import async_session  # noqa: E402
from models.file import File  # noqa: E402
from models.user import User  # noqa: E402


LEGACY_CONVERSATION_NAMESPACE = uuid.UUID("c6763c9a-09f9-42aa-92fd-c024be58f6aa")
LEGACY_MESSAGE_NAMESPACE = uuid.UUID("108b8afd-8072-4b16-b177-e1df11bed7cc")


async def backfill_owners(*, dry_run: bool) -> int:
    async with async_session() as db:
        users = (
            await db.execute(select(User).where(User.clerk_sub.is_not(None)))
        ).scalars().all()
        owner_by_email = {
            user.email.strip().lower(): user.clerk_sub
            for user in users
            if user.email and user.clerk_sub
        }
        files = (
            await db.execute(select(File).where(File.owner_sub.is_(None)))
        ).scalars().all()
        claimed = 0
        for file_record in files:
            owner_sub = owner_by_email.get((file_record.created_by or "").strip().lower())
            if not owner_sub:
                continue
            file_record.owner_sub = owner_sub
            claimed += 1
        if dry_run:
            await db.rollback()
        else:
            await db.commit()
        return claimed


async def migrate_legacy_chats(*, dry_run: bool) -> tuple[int, int]:
    async with async_session() as db:
        files = (
            await db.execute(select(File).where(File.owner_sub.is_not(None)))
        ).scalars().all()
        conversations_created = 0
        messages_created = 0

        for file_record in files:
            legacy_rows = (
                await db.execute(
                    select(ChatMessage)
                    .where(ChatMessage.file_id == str(file_record.file_id))
                    .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
                )
            ).scalars().all()
            if not legacy_rows:
                continue

            conversation_id = uuid.uuid5(
                LEGACY_CONVERSATION_NAMESPACE,
                f"{file_record.owner_sub}:{file_record.file_id}",
            )
            conversation = (
                await db.execute(
                    select(Conversation).where(Conversation.id == conversation_id)
                )
            ).scalar_one_or_none()
            if conversation is None:
                conversation = Conversation(
                    id=conversation_id,
                    owner_sub=file_record.owner_sub,
                    title=file_record.file_name[:160],
                    mode="document",
                    status="active",
                    created_at=legacy_rows[0].created_at,
                    updated_at=legacy_rows[-1].created_at,
                    last_message_at=legacy_rows[-1].created_at,
                )
                db.add(conversation)
                db.add(
                    ConversationDocument(
                        conversation_id=conversation_id,
                        file_id=file_record.file_id,
                    )
                )
                conversations_created += 1

            previous_user_id: uuid.UUID | None = None
            for legacy in legacy_rows:
                message_id = uuid.uuid5(
                    LEGACY_MESSAGE_NAMESPACE,
                    f"{conversation_id}:{legacy.id}",
                )
                exists = (
                    await db.execute(
                        select(ConversationMessage.id).where(
                            ConversationMessage.id == message_id
                        )
                    )
                ).scalar_one_or_none()
                if exists:
                    if legacy.role == "user":
                        previous_user_id = message_id
                    continue
                db.add(
                    ConversationMessage(
                        id=message_id,
                        conversation_id=conversation_id,
                        parent_message_id=(
                            previous_user_id if legacy.role == "assistant" else None
                        ),
                        role=legacy.role,
                        content=legacy.content,
                        status="complete",
                        created_at=legacy.created_at,
                        completed_at=legacy.created_at,
                    )
                )
                if legacy.role == "user":
                    previous_user_id = message_id
                messages_created += 1

        if dry_run:
            await db.rollback()
        else:
            await db.commit()
        return conversations_created, messages_created


async def queue_reindex(*, dry_run: bool, limit: int | None) -> int:
    async with async_session() as db:
        stmt = (
            select(File)
            .where(
                File.owner_sub.is_not(None),
                File.status == "ready",
                or_(
                    File.embedding_version.is_(None),
                    File.embedding_version != settings.EMBEDDING_VERSION,
                ),
            )
            .order_by(File.created_at.asc())
        )
        if limit:
            stmt = stmt.limit(limit)
        files = (await db.execute(stmt)).scalars().all()
        queued = 0

        for file_record in files:
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
                job.phase = "Queued for reindexing"
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

        if dry_run:
            await db.rollback()
        else:
            await db.commit()
        return queued


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--step",
        choices=("owners", "legacy-chats", "reindex", "all"),
        default="all",
    )
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.step in {"owners", "all"}:
        claimed = await backfill_owners(dry_run=args.dry_run)
        print(f"owner rows {'found' if args.dry_run else 'backfilled'}: {claimed}")
    if args.step in {"legacy-chats", "all"}:
        conversations, messages = await migrate_legacy_chats(dry_run=args.dry_run)
        print(
            f"legacy conversations/messages {'found' if args.dry_run else 'migrated'}: "
            f"{conversations}/{messages}"
        )
    if args.step in {"reindex", "all"}:
        queued = await queue_reindex(dry_run=args.dry_run, limit=args.limit)
        print(f"files {'eligible' if args.dry_run else 'queued'} for reindex: {queued}")


if __name__ == "__main__":
    asyncio.run(main())
