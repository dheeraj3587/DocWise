"""
Celery worker for background tasks — file processing, transcription, embedding.
Keeps the API fast by offloading heavy work to background.
"""

import os
import sys

# CRITICAL: Fix sys.path BEFORE any other imports
_app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _app_dir)

from celery import Celery

from core.config import settings

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
    worker_prefetch_multiplier=1,
)


@celery_app.task(name="tasks.process_pdf", bind=True, max_retries=3)
def process_pdf(self, file_id: str, storage_key: str):
    """
    Background task: Download PDF from MinIO → extract text → chunk → embed in FAISS.
    Updates file status to 'ready' when done.
    """
    import asyncio
    asyncio.run(_process_pdf_async(file_id, storage_key))


async def _process_pdf_async(file_id: str, storage_key: str):
    import os, sys
    _app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, _app_dir)
    
    from services.storage_service import storage_service
    from services.pdf_service import pdf_service
    from services.embedding_service import embedding_service
    from models.database import async_session
    from models.file import File
    from sqlalchemy import select
    import uuid as uuid_mod

    # Download PDF from MinIO
    pdf_bytes = storage_service.download_file(storage_key)

    # Extract and chunk
    chunks = pdf_service.extract_and_chunk(pdf_bytes)

    # Embed into FAISS
    embedding_service.ingest_document(file_id, chunks)

    # Update file status
    async with async_session() as session:
        stmt = select(File).where(File.file_id == uuid_mod.UUID(file_id))
        result = await session.execute(stmt)
        file_record = result.scalar_one_or_none()
        if file_record:
            file_record.status = "ready"
            await session.commit()


@celery_app.task(name="tasks.process_media", bind=True, max_retries=3)
def process_media(self, file_id: str, storage_key: str, file_name: str):
    """
    Background task: Download audio/video from MinIO → transcribe with Whisper →
    extract timestamps → chunk transcript → embed in FAISS.
    """
    import asyncio
    asyncio.run(_process_media_async(file_id, storage_key, file_name))


async def _process_media_async(file_id: str, storage_key: str, file_name: str):
    import os, sys
    _app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, _app_dir)
    
    from services.storage_service import storage_service
    from services.transcription_service import transcription_service
    from services.embedding_service import embedding_service
    from services.timestamp_service import timestamp_service
    from models.database import async_session
    from models.file import File
    from models.timestamp import MediaTimestamp
    from sqlalchemy import select
    import uuid as uuid_mod

    # Download media from MinIO
    media_bytes = storage_service.download_file(storage_key)

    # Transcribe with Whisper
    result = transcription_service.transcribe(media_bytes, file_name)

    transcript = result["text"]
    segments = result["segments"]
    duration = result["duration"]

    # Get chunks with timestamps for embedding
    chunks_with_ts = transcription_service.get_chunks_with_timestamps(segments)

    chunk_texts = [c["text"] for c in chunks_with_ts]
    timestamp_data = [
        {"start_time": c["start_time"], "end_time": c["end_time"]}
        for c in chunks_with_ts
    ]

    # Embed into FAISS
    embedding_service.ingest_document(file_id, chunk_texts, timestamp_data)

    # Extract topic-level timestamps using LLM
    topics = await timestamp_service.extract_topics(segments)

    # Update database
    async with async_session() as session:
        # Update file record
        stmt = select(File).where(File.file_id == uuid_mod.UUID(file_id))
        res = await session.execute(stmt)
        file_record = res.scalar_one_or_none()
        if file_record:
            file_record.transcript = transcript
            file_record.duration_seconds = duration
            file_record.status = "ready"

        # Store timestamps
        for topic in topics:
            ts = MediaTimestamp(
                file_id=uuid_mod.UUID(file_id),
                start_time=topic.get("start_time", 0.0),
                end_time=topic.get("end_time", 0.0),
                text=topic.get("text", ""),
                topic=topic.get("topic", ""),
            )
            session.add(ts)

        await session.commit()
