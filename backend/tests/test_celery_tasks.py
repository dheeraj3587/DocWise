"""Tests for tasks.celery_worker — background processing tasks."""

import asyncio
import os
import uuid
from unittest.mock import patch, MagicMock, AsyncMock

import pytest


@pytest.mark.asyncio
class TestProcessPdfAsync:
    """Tests for _process_pdf_async."""

    async def test_process_pdf_full_pipeline(self):
        file_id = str(uuid.uuid4())
        storage_key = "pdf/test/file.pdf"

        # Mock all external services
        mock_storage = MagicMock()
        mock_storage.download_file.return_value = b"%PDF-1.4 test content"

        mock_pdf = MagicMock()
        mock_pdf.extract_structured_chunks.return_value = [
            {"ordinal": 0, "text": "chunk 1", "page_start": 1, "page_end": 1},
            {"ordinal": 1, "text": "chunk 2", "page_start": 2, "page_end": 2},
        ]

        mock_embedding = MagicMock()
        mock_index = MagicMock()
        mock_index.replace_chunks = AsyncMock(return_value=2)

        mock_file_record = MagicMock()
        mock_file_record.status = "processing"

        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_file_record
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()

        with patch.dict("sys.modules", {}):
            with patch("tasks.celery_worker.storage_service", mock_storage, create=True), \
                 patch("tasks.celery_worker.pdf_service", mock_pdf, create=True), \
                 patch("tasks.celery_worker.embedding_service", mock_embedding, create=True):

                from tasks.celery_worker import _process_pdf_async

                # Patch the internal imports
                with patch("services.storage_service.storage_service", mock_storage), \
                     patch("services.pdf_service.pdf_service", mock_pdf), \
                     patch("services.embedding_service.embedding_service", mock_embedding), \
                     patch("services.document_index_service.document_index_service", mock_index), \
                     patch("tasks.celery_worker._find_job", new_callable=AsyncMock, return_value=None), \
                     patch("models.database.async_session") as mock_session_factory:

                    mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
                    mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

                    await _process_pdf_async(file_id, storage_key)
                    mock_index.replace_chunks.assert_awaited_once()

    async def test_process_pdf_no_file_record(self):
        """When file record is not found, should not crash."""
        file_id = str(uuid.uuid4())

        mock_storage = MagicMock()
        mock_storage.download_file.return_value = b"%PDF data"

        mock_pdf = MagicMock()
        mock_pdf.extract_structured_chunks.return_value = [
            {"ordinal": 0, "text": "chunk", "page_start": 1, "page_end": 1}
        ]

        mock_embedding = MagicMock()

        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()

        with patch("services.storage_service.storage_service", mock_storage), \
             patch("services.pdf_service.pdf_service", mock_pdf), \
             patch("services.embedding_service.embedding_service", mock_embedding), \
             patch("tasks.celery_worker._find_job", new_callable=AsyncMock, return_value=None), \
             patch("models.database.async_session") as mock_session_factory:

            mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            from tasks.celery_worker import _process_pdf_async
            await _process_pdf_async(file_id, "storage/key.pdf")


@pytest.mark.asyncio
class TestProcessMediaAsync:
    """Tests for _process_media_async."""

    async def test_process_media_full_pipeline(self):
        file_id = str(uuid.uuid4())

        mock_storage = MagicMock()
        mock_storage.download_file.return_value = b"fake audio data"

        mock_transcription = MagicMock()
        mock_transcription.transcribe.return_value = {
            "text": "Hello world",
            "segments": [
                {"start": 0.0, "end": 2.0, "text": "Hello"},
                {"start": 2.0, "end": 4.0, "text": " world"},
            ],
            "duration": 4.0,
        }
        mock_transcription.get_chunks_with_timestamps.return_value = [
            {"text": "Hello world", "start_time": 0.0, "end_time": 4.0},
        ]

        mock_embedding = MagicMock()
        mock_index = MagicMock()
        mock_index.replace_chunks = AsyncMock(return_value=1)

        mock_timestamp = MagicMock()
        mock_timestamp.extract_topics = AsyncMock(return_value=[
            {"topic": "Greeting", "start_time": 0.0, "end_time": 4.0, "text": "Hello world"},
        ])

        mock_file_record = MagicMock()
        mock_file_record.status = "processing"

        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_file_record
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.add = MagicMock()

        with patch("services.storage_service.storage_service", mock_storage), \
             patch("services.transcription_service.transcription_service", mock_transcription), \
             patch("services.embedding_service.embedding_service", mock_embedding), \
             patch("services.document_index_service.document_index_service", mock_index), \
             patch("services.timestamp_service.timestamp_service", mock_timestamp), \
             patch("tasks.celery_worker._find_job", new_callable=AsyncMock, return_value=None), \
             patch("models.database.async_session") as mock_session_factory:

            mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            from tasks.celery_worker import _process_media_async
            await _process_media_async(file_id, "media/test.mp3", "test.mp3")
            mock_index.replace_chunks.assert_awaited_once()


def test_worker_runner_reuses_one_event_loop_per_process():
    import tasks.celery_worker as worker

    previous_loop = worker._worker_loop
    previous_pid = worker._worker_loop_pid
    worker._worker_loop = None
    worker._worker_loop_pid = None

    async def running_loop_id():
        return id(asyncio.get_running_loop())

    try:
        first_loop = worker._run(running_loop_id())
        second_loop = worker._run(running_loop_id())

        assert first_loop == second_loop
        assert worker._worker_loop_pid == os.getpid()
    finally:
        if worker._worker_loop is not None:
            worker._worker_loop.close()
        worker._worker_loop = previous_loop
        worker._worker_loop_pid = previous_pid
