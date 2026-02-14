"""Tests for tasks.celery_worker — background processing tasks."""

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
        mock_pdf.extract_and_chunk.return_value = ["chunk 1", "chunk 2"]

        mock_embedding = MagicMock()

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
                     patch("models.database.async_session") as mock_session_factory:

                    mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
                    mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

                    await _process_pdf_async(file_id, storage_key)

    async def test_process_pdf_no_file_record(self):
        """When file record is not found, should not crash."""
        file_id = str(uuid.uuid4())

        mock_storage = MagicMock()
        mock_storage.download_file.return_value = b"%PDF data"

        mock_pdf = MagicMock()
        mock_pdf.extract_and_chunk.return_value = ["chunk"]

        mock_embedding = MagicMock()

        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()

        with patch("services.storage_service.storage_service", mock_storage), \
             patch("services.pdf_service.pdf_service", mock_pdf), \
             patch("services.embedding_service.embedding_service", mock_embedding), \
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
             patch("services.timestamp_service.timestamp_service", mock_timestamp), \
             patch("models.database.async_session") as mock_session_factory:

            mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            from tasks.celery_worker import _process_media_async
            await _process_media_async(file_id, "media/test.mp3", "test.mp3")
