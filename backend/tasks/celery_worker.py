"""Durable Celery tasks for indexing, summaries, outbox delivery, and recovery."""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta

from celery import Celery
from sqlalchemy import delete, func, select


_app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _app_dir)

from core.config import settings  # noqa: E402


celery_app = Celery(
    "docwise",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=25 * 60,
    task_time_limit=30 * 60,
    beat_schedule={
        "dispatch-docwise-outbox": {
            "task": "tasks.dispatch_outbox",
            "schedule": 10.0,
        },
        "recover-stale-docwise-jobs": {
            "task": "tasks.recover_stale_jobs",
            "schedule": 60.0,
        },
        "publish-docwise-worker-heartbeat": {
            "task": "tasks.worker_heartbeat",
            "schedule": 30.0,
        },
    },
)


def _run(coro):
    return asyncio.run(coro)


@celery_app.task(name="tasks.worker_heartbeat")
def worker_heartbeat():
    """Publish proof that Beat can enqueue and a worker can execute tasks."""
    from redis import Redis

    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        timestamp = datetime.utcnow().isoformat()
        redis.set("docwise:worker:heartbeat", timestamp, ex=90)
        return {"heartbeat": timestamp}
    finally:
        redis.close()


@celery_app.task(name="tasks.process_pdf", bind=True, max_retries=3)
def process_pdf(
    self,
    file_id: str,
    storage_key: str,
    job_id: str | None = None,
):
    try:
        return _run(
            _process_pdf_async(
                file_id,
                storage_key,
                job_id=job_id,
                attempt=self.request.retries + 1,
                final_attempt=self.request.retries >= self.max_retries,
            )
        )
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            raise
        from core.observability import JOB_RETRIES
        JOB_RETRIES.labels("pdf").inc()
        raise self.retry(
            exc=exc,
            countdown=min(60, 2 ** (self.request.retries + 1)),
        )


async def _process_pdf_async(
    file_id: str,
    storage_key: str,
    *,
    job_id: str | None = None,
    attempt: int = 1,
    final_attempt: bool = True,
):
    from core.cache import cache_service
    from models.conversation import ProcessingJob
    from models.database import async_session
    from models.file import File
    from services.document_index_service import document_index_service
    from services.embedding_service import embedding_service
    from services.pdf_service import pdf_service
    from services.storage_service import storage_service

    file_uuid = uuid.UUID(file_id)

    async def progress(value: int, phase: str, status_value: str = "processing"):
        async with async_session() as db:
            file_record = (
                await db.execute(select(File).where(File.file_id == file_uuid))
            ).scalar_one_or_none()
            if file_record:
                file_record.status = status_value
                file_record.processing_error = None
            job = await _find_job(db, file_uuid, job_id)
            if job:
                job.status = "running" if status_value == "processing" else status_value
                job.phase = phase
                job.progress = value
                job.attempts = max(job.attempts, attempt)
                job.heartbeat_at = datetime.utcnow()
                job.started_at = job.started_at or datetime.utcnow()
            await db.commit()
        await cache_service.set_json(
            f"files:progress:{file_id}",
            {"fileId": file_id, "status": status_value, "phase": phase, "progress": value},
            ttl_seconds=86400,
        )

    try:
        await progress(8, "Downloading file")
        pdf_bytes = storage_service.download_file(storage_key)
        await progress(30, "Extracting page-aware text")
        chunks = pdf_service.extract_structured_chunks(pdf_bytes)

        await progress(66, "Embedding document chunks")
        async with async_session() as db:
            file_record = (
                await db.execute(select(File).where(File.file_id == file_uuid))
            ).scalar_one_or_none()
            if file_record is None:
                return
            await document_index_service.replace_chunks(db, file_record, chunks)
            await db.commit()

        if settings.LEGACY_FAISS_DUAL_WRITE:
            await asyncio.to_thread(
                embedding_service.ingest_document,
                file_id,
                [str(chunk["text"]) for chunk in chunks],
            )

        async with async_session() as db:
            file_record = (
                await db.execute(select(File).where(File.file_id == file_uuid))
            ).scalar_one_or_none()
            if file_record:
                file_record.status = "ready"
                file_record.processing_error = None
            job = await _find_job(db, file_uuid, job_id)
            if job:
                job.status = "ready"
                job.phase = "Ready"
                job.progress = 100
                job.completed_at = datetime.utcnow()
                job.heartbeat_at = datetime.utcnow()
            await db.commit()
        await progress(100, "Ready", "ready")
        return {"fileId": file_id, "chunks": len(chunks)}
    except Exception as exc:
        await _record_processing_failure(
            file_uuid,
            job_id,
            exc,
            attempt=attempt,
            final_attempt=final_attempt,
        )
        await cache_service.set_json(
            f"files:progress:{file_id}",
            {
                "fileId": file_id,
                "status": "failed" if final_attempt else "processing",
                "phase": "Processing failed" if final_attempt else "Retrying processing",
                "progress": 100 if final_attempt else 1,
            },
            ttl_seconds=86400,
        )
        raise


@celery_app.task(name="tasks.process_media", bind=True, max_retries=3)
def process_media(
    self,
    file_id: str,
    storage_key: str,
    file_name: str,
    job_id: str | None = None,
):
    try:
        return _run(
            _process_media_async(
                file_id,
                storage_key,
                file_name,
                job_id=job_id,
                attempt=self.request.retries + 1,
                final_attempt=self.request.retries >= self.max_retries,
            )
        )
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            raise
        from core.observability import JOB_RETRIES
        JOB_RETRIES.labels("media").inc()
        raise self.retry(
            exc=exc,
            countdown=min(60, 2 ** (self.request.retries + 1)),
        )


async def _process_media_async(
    file_id: str,
    storage_key: str,
    file_name: str,
    *,
    job_id: str | None = None,
    attempt: int = 1,
    final_attempt: bool = True,
):
    from core.cache import cache_service
    from models.database import async_session
    from models.file import File
    from models.timestamp import MediaTimestamp
    from services.document_index_service import document_index_service
    from services.embedding_service import embedding_service
    from services.storage_service import storage_service
    from services.timestamp_service import timestamp_service
    from services.transcription_service import transcription_service

    file_uuid = uuid.UUID(file_id)

    async def progress(value: int, phase: str, status_value: str = "processing"):
        async with async_session() as db:
            file_record = (
                await db.execute(select(File).where(File.file_id == file_uuid))
            ).scalar_one_or_none()
            if file_record:
                file_record.status = status_value
            job = await _find_job(db, file_uuid, job_id)
            if job:
                job.status = "running" if status_value == "processing" else status_value
                job.phase = phase
                job.progress = value
                job.attempts = max(job.attempts, attempt)
                job.heartbeat_at = datetime.utcnow()
                job.started_at = job.started_at or datetime.utcnow()
            await db.commit()
        await cache_service.set_json(
            f"files:progress:{file_id}",
            {"fileId": file_id, "status": status_value, "phase": phase, "progress": value},
            ttl_seconds=86400,
        )

    try:
        await progress(8, "Downloading media")
        media_bytes = storage_service.download_file(storage_key)
        await progress(28, "Transcribing media")
        result = transcription_service.transcribe(media_bytes, file_name)
        transcript = result["text"]
        segments = result["segments"]
        duration = result["duration"]

        await progress(48, "Chunking timestamped transcript")
        timestamped = transcription_service.get_chunks_with_timestamps(segments)
        chunks = [
            {
                "ordinal": index,
                "text": chunk["text"],
                "page_start": None,
                "page_end": None,
                "character_start": None,
                "character_end": None,
                "start_time": chunk.get("start_time"),
                "end_time": chunk.get("end_time"),
            }
            for index, chunk in enumerate(timestamped)
        ]

        await progress(68, "Embedding transcript chunks")
        topics = await timestamp_service.extract_topics(segments)
        async with async_session() as db:
            file_record = (
                await db.execute(select(File).where(File.file_id == file_uuid))
            ).scalar_one_or_none()
            if file_record is None:
                return
            await document_index_service.replace_chunks(db, file_record, chunks)
            file_record.transcript = transcript
            file_record.duration_seconds = duration
            file_record.status = "ready"
            file_record.processing_error = None
            await db.execute(delete(MediaTimestamp).where(MediaTimestamp.file_id == file_uuid))
            for topic in topics:
                db.add(
                    MediaTimestamp(
                        file_id=file_uuid,
                        start_time=topic.get("start_time", 0.0),
                        end_time=topic.get("end_time", 0.0),
                        text=topic.get("text", ""),
                        topic=topic.get("topic", ""),
                    )
                )
            job = await _find_job(db, file_uuid, job_id)
            if job:
                job.status = "ready"
                job.phase = "Ready"
                job.progress = 100
                job.completed_at = datetime.utcnow()
                job.heartbeat_at = datetime.utcnow()
            await db.commit()

        if settings.LEGACY_FAISS_DUAL_WRITE:
            await asyncio.to_thread(
                embedding_service.ingest_document,
                file_id,
                [str(chunk["text"]) for chunk in chunks],
                [
                    {"start_time": chunk.get("start_time"), "end_time": chunk.get("end_time")}
                    for chunk in chunks
                ],
            )
        await progress(100, "Ready", "ready")
        return {"fileId": file_id, "chunks": len(chunks)}
    except Exception as exc:
        await _record_processing_failure(
            file_uuid,
            job_id,
            exc,
            attempt=attempt,
            final_attempt=final_attempt,
        )
        await cache_service.set_json(
            f"files:progress:{file_id}",
            {
                "fileId": file_id,
                "status": "failed" if final_attempt else "processing",
                "phase": "Processing failed" if final_attempt else "Retrying processing",
                "progress": 100 if final_attempt else 1,
            },
            ttl_seconds=86400,
        )
        raise


async def _find_job(db, file_id: uuid.UUID, job_id: str | None):
    from models.conversation import ProcessingJob

    stmt = select(ProcessingJob).where(ProcessingJob.file_id == file_id)
    if job_id:
        stmt = stmt.where(ProcessingJob.id == uuid.UUID(job_id))
    return (
        await db.execute(stmt.order_by(ProcessingJob.created_at.desc()).limit(1))
    ).scalar_one_or_none()


async def _record_processing_failure(
    file_id: uuid.UUID,
    job_id: str | None,
    exc: Exception,
    *,
    attempt: int,
    final_attempt: bool,
) -> None:
    from models.database import async_session
    from models.file import File

    async with async_session() as db:
        file_record = (
            await db.execute(select(File).where(File.file_id == file_id))
        ).scalar_one_or_none()
        if file_record:
            file_record.status = "failed" if final_attempt else "processing"
            file_record.processing_error = str(exc)[:2000]
        job = await _find_job(db, file_id, job_id)
        if job:
            job.status = "failed" if final_attempt else "retrying"
            job.phase = "Processing failed" if final_attempt else "Retrying processing"
            job.progress = 100 if final_attempt else 1
            job.attempts = max(job.attempts, attempt)
            job.error_code = exc.__class__.__name__
            job.error_detail = str(exc)[:2000]
            job.heartbeat_at = datetime.utcnow()
            if final_attempt:
                job.completed_at = datetime.utcnow()
        await db.commit()


@celery_app.task(name="tasks.dispatch_outbox")
def dispatch_outbox():
    return _run(_dispatch_outbox_async())


async def _dispatch_outbox_async(limit: int = 25):
    from models.conversation import OutboxEvent
    from models.database import async_session
    from services.storage_service import storage_service
    from core.observability import OUTBOX_QUEUE_DEPTH

    async with async_session() as db:
        events = (
            await db.execute(
                select(OutboxEvent)
                .where(
                    OutboxEvent.status == "pending",
                    OutboxEvent.available_at <= datetime.utcnow(),
                )
                .order_by(OutboxEvent.created_at.asc())
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        ).scalars().all()
        pending_count = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(OutboxEvent)
                    .where(OutboxEvent.status == "pending")
                )
            ).scalar()
            or 0
        )
        OUTBOX_QUEUE_DEPTH.set(pending_count)

        dispatched = 0
        for event in events:
            try:
                if event.event_type == "file.process":
                    payload = event.payload
                    if payload["fileType"] == "pdf":
                        process_pdf.delay(
                            payload["fileId"],
                            payload["storageKey"],
                            payload.get("jobId"),
                        )
                    else:
                        process_media.delay(
                            payload["fileId"],
                            payload["storageKey"],
                            payload["fileName"],
                            payload.get("jobId"),
                        )
                elif event.event_type == "conversation.summarize":
                    summarize_conversation.delay(
                        event.payload["conversationId"],
                        event.payload["throughMessageId"],
                    )
                elif event.event_type == "storage.delete":
                    storage_service.delete_file(event.payload["storageKey"])
                else:
                    raise ValueError(f"Unknown outbox event: {event.event_type}")

                event.status = "processed"
                event.processed_at = datetime.utcnow()
                event.last_error = None
                dispatched += 1
            except Exception as exc:
                event.attempts += 1
                event.last_error = str(exc)[:2000]
                event.available_at = datetime.utcnow() + timedelta(
                    seconds=min(300, 2 ** min(event.attempts, 8))
                )
                if event.attempts >= 10:
                    event.status = "failed"
        await db.commit()
        return {"dispatched": dispatched, "seen": len(events)}


@celery_app.task(name="tasks.recover_stale_jobs")
def recover_stale_jobs():
    return _run(_recover_stale_jobs_async())


async def _recover_stale_jobs_async():
    from models.conversation import OutboxEvent, ProcessingJob
    from models.database import async_session
    from models.file import File
    from core.observability import STUCK_JOBS

    cutoff = datetime.utcnow() - timedelta(seconds=settings.PROCESSING_STALE_AFTER_SECONDS)
    async with async_session() as db:
        jobs = (
            await db.execute(
                select(ProcessingJob).where(
                    ProcessingJob.status.in_(["running", "retrying"]),
                    ProcessingJob.heartbeat_at < cutoff,
                    ProcessingJob.attempts < ProcessingJob.max_attempts,
                )
            )
        ).scalars().all()
        STUCK_JOBS.set(len(jobs))
        for job in jobs:
            file_record = (
                await db.execute(select(File).where(File.file_id == job.file_id))
            ).scalar_one_or_none()
            if file_record is None:
                continue
            job.status = "queued"
            job.phase = "Recovered after worker interruption"
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
        await db.commit()
        return {"recovered": len(jobs)}


@celery_app.task(name="tasks.summarize_conversation", bind=True, max_retries=3)
def summarize_conversation(self, conversation_id: str, through_message_id: str):
    try:
        return _run(_summarize_conversation_async(conversation_id, through_message_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=min(120, 2 ** (self.request.retries + 1)))


async def _summarize_conversation_async(conversation_id: str, through_message_id: str):
    from models.conversation import Conversation, ConversationMessage
    from models.database import async_session
    from services.model_registry import resolve_chat_model
    from services.provider_service import provider_service

    conversation_uuid = uuid.UUID(conversation_id)
    through_uuid = uuid.UUID(through_message_id)
    async with async_session() as db:
        conversation = (
            await db.execute(select(Conversation).where(Conversation.id == conversation_uuid))
        ).scalar_one_or_none()
        if conversation is None or conversation.summary_through_message_id == through_uuid:
            return {"status": "skipped"}
        through_message = (
            await db.execute(
                select(ConversationMessage).where(
                    ConversationMessage.id == through_uuid,
                    ConversationMessage.conversation_id == conversation_uuid,
                    ConversationMessage.status == "complete",
                )
            )
        ).scalar_one_or_none()
        if through_message is None:
            return {"status": "skipped"}

        boundary_time = None
        if conversation.summary_through_message_id:
            boundary = (
                await db.execute(
                    select(ConversationMessage).where(
                        ConversationMessage.id == conversation.summary_through_message_id,
                        ConversationMessage.conversation_id == conversation_uuid,
                    )
                )
            ).scalar_one_or_none()
            boundary_time = boundary.created_at if boundary else None

        message_filters = [
            ConversationMessage.conversation_id == conversation_uuid,
            ConversationMessage.status == "complete",
            ConversationMessage.created_at <= through_message.created_at,
        ]
        if boundary_time is not None:
            message_filters.append(ConversationMessage.created_at > boundary_time)
        messages = (
            await db.execute(
                select(ConversationMessage)
                .where(*message_filters)
                .order_by(ConversationMessage.created_at.asc())
                .limit(120)
            )
        ).scalars().all()
        if not messages:
            return {"status": "skipped"}
        prior_summary = conversation.summary or ""
        model = resolve_chat_model(conversation.selected_model_id, False)
        if model is None:
            model = resolve_chat_model(None, False)
        if model is None:
            raise RuntimeError("No chat model is available for summarization")

    transcript = "\n".join(f"{message.role}: {message.content}" for message in messages)
    summary, _ = await provider_service.complete(
        model,
        [
            {
                "role": "system",
                "content": (
                    "Create a compact factual memory for a future assistant. Preserve user goals, "
                    "decisions, constraints, and unresolved questions. Do not add facts or private reasoning."
                ),
            },
            {
                "role": "user",
                "content": f"Previous summary:\n{prior_summary}\n\nCompleted turns:\n{transcript}",
            },
        ],
    )

    async with async_session() as db:
        conversation = (
            await db.execute(select(Conversation).where(Conversation.id == conversation_uuid))
        ).scalar_one_or_none()
        if conversation:
            conversation.summary = summary[:12000]
            conversation.summary_through_message_id = through_uuid
            conversation.updated_at = datetime.utcnow()
            await db.commit()
    return {"status": "updated"}
