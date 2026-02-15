"""Tests for file upload, retrieval, listing, and deletion."""

import io
import uuid
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio

from core.config import settings


@pytest.mark.asyncio
class TestFileUpload:
    """Tests for POST /api/files/upload"""

    async def test_upload_pdf_success(self, client, mock_storage, mock_celery):
        """Test successful PDF upload."""
        mock_storage.upload_file = MagicMock(return_value="pdf/test/file.pdf")

        response = await client.post(
            "/api/files/upload",
            files={"file": ("test.pdf", b"%PDF-1.4 test content", "application/pdf")},
            data={"file_name": "My Test PDF"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["fileName"] == "My Test PDF"
        assert data["fileType"] == "pdf"
        assert data["status"] == "processing"
        assert "fileId" in data

    async def test_upload_audio_success(self, client, mock_storage, mock_celery):
        """Test successful audio upload."""
        mock_storage.upload_file = MagicMock(return_value="audio/test/file.mp3")

        response = await client.post(
            "/api/files/upload",
            files={"file": ("test.mp3", b"fake-audio-bytes", "audio/mpeg")},
            data={"file_name": "My Audio"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["fileType"] == "audio"
        assert data["status"] == "processing"

    async def test_upload_video_success(self, client, mock_storage, mock_celery):
        """Test successful video upload."""
        mock_storage.upload_file = MagicMock(return_value="video/test/file.mp4")

        response = await client.post(
            "/api/files/upload",
            files={"file": ("test.mp4", b"fake-video-bytes", "video/mp4")},
            data={"file_name": "My Video"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["fileType"] == "video"

    async def test_upload_unsupported_type(self, client, mock_storage):
        """Test upload with unsupported file type."""
        response = await client.post(
            "/api/files/upload",
            files={"file": ("test.exe", b"fake-bytes", "application/x-executable")},
        )

        assert response.status_code == 400
        assert "Unsupported file type" in response.json()["detail"]

    async def test_upload_no_file(self, client):
        """Test upload with no file."""
        response = await client.post("/api/files/upload")
        assert response.status_code == 422  # Validation error

    async def test_upload_default_filename(self, client, mock_storage, mock_celery):
        """Test upload without explicit file_name uses original filename."""
        mock_storage.upload_file = MagicMock(return_value="pdf/test/doc.pdf")

        response = await client.post(
            "/api/files/upload",
            files={"file": ("original.pdf", b"%PDF-1.4 content", "application/pdf")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["fileName"] == "original.pdf"

    async def test_upload_wav_audio(self, client, mock_storage, mock_celery):
        """Test WAV audio upload."""
        response = await client.post(
            "/api/files/upload",
            files={"file": ("test.wav", b"RIFF....", "audio/wav")},
        )
        assert response.status_code == 200
        assert response.json()["fileType"] == "audio"

    async def test_upload_webm_video(self, client, mock_storage, mock_celery):
        """Test WebM video upload."""
        response = await client.post(
            "/api/files/upload",
            files={"file": ("test.webm", b"webm-bytes", "video/webm")},
        )
        assert response.status_code == 200
        assert response.json()["fileType"] == "video"

    async def test_upload_quicktime_video(self, client, mock_storage, mock_celery):
        """Test QuickTime MOV video upload."""
        response = await client.post(
            "/api/files/upload",
            files={"file": ("test.mov", b"mov-bytes", "video/quicktime")},
        )
        assert response.status_code == 200
        assert response.json()["fileType"] == "video"


@pytest.mark.asyncio
class TestFileRetrieval:
    """Tests for GET /api/files/{file_id} and GET /api/files"""

    async def test_get_file_not_found(self, client):
        """Test getting a file that doesn't exist."""
        fake_id = str(uuid.uuid4())
        response = await client.get(f"/api/files/{fake_id}")
        assert response.status_code == 404

    async def test_get_file_after_upload(self, client, mock_storage, mock_celery):
        """Test retrieving a file after uploading it."""
        mock_storage.upload_file = MagicMock(return_value="pdf/test/file.pdf")
        mock_storage.get_presigned_url = MagicMock(return_value="https://minio/url")

        # Upload first
        upload_resp = await client.post(
            "/api/files/upload",
            files={"file": ("test.pdf", b"%PDF-1.4", "application/pdf")},
            data={"file_name": "My PDF"},
        )
        file_id = upload_resp.json()["fileId"]

        # Retrieve
        response = await client.get(f"/api/files/{file_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["fileId"] == file_id
        assert data["fileName"] == "My PDF"
        assert data["fileType"] == "pdf"
        assert "fileUrl" in data

    async def test_list_files_empty(self, client):
        """Test listing files when none exist."""
        response = await client.get("/api/files")
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_files_after_upload(self, client, mock_storage, mock_celery):
        """Test listing files after uploading."""
        mock_storage.upload_file = MagicMock(return_value="pdf/test/file.pdf")
        mock_storage.get_presigned_url = MagicMock(return_value="https://minio/url")

        # Upload two files
        await client.post(
            "/api/files/upload",
            files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
            data={"file_name": "File A"},
        )
        await client.post(
            "/api/files/upload",
            files={"file": ("b.pdf", b"%PDF-1.4", "application/pdf")},
            data={"file_name": "File B"},
        )

        response = await client.get("/api/files")
        assert response.status_code == 200
        files = response.json()
        assert len(files) == 2

    async def test_list_files_only_returns_own(self, client):
        """Test that list_files only returns files owned by the authenticated user."""
        from models.database import async_session
        from models.file import File
        
        async with async_session() as session:
            f1 = File(
                file_id=uuid.uuid4(),
                file_name="mine.pdf",
                file_type="pdf",
                storage_key="key1",
                created_by="test@example.com",
                status="ready"
            )
            f2 = File(
                file_id=uuid.uuid4(),
                file_name="not-mine.pdf",
                file_type="pdf",
                storage_key="key2",
                created_by="other@example.com",
                status="ready"
            )
            session.add(f1)
            session.add(f2)
            await session.commit()

        # Should only return the file owned by test@example.com
        response = await client.get("/api/files")
        assert response.status_code == 200
        files = response.json()
        assert len(files) == 1
        assert files[0]["fileName"] == "mine.pdf"


    async def test_get_file_with_timestamps(self, client):
        """Test retrieving a media file includes its timestamps."""
        # Manually create file with timestamps in DB
        file_id = str(uuid.uuid4())
        
        from models.database import async_session
        from models.file import File
        from models.timestamp import MediaTimestamp
        
        async with async_session() as session:
            f = File(
                file_id=uuid.UUID(file_id),
                file_name="test.mp3",
                file_type="audio",
                storage_key="key",
                created_by="test@example.com",
                status="ready"
            )
            session.add(f)
            ts = MediaTimestamp(
                file_id=uuid.UUID(file_id),
                start_time=10.0,
                end_time=20.0,
                topic="Topic 1",
                text="Content"
            )
            session.add(ts)
            await session.commit()


        response = await client.get(f"/api/files/{file_id}")
        assert response.status_code == 200
        data = response.json()
        assert "timestamps" in data
        assert len(data["timestamps"]) == 1
        assert data["timestamps"][0]["topic"] == "Topic 1"



@pytest.mark.asyncio
class TestFileDelete:
    """Tests for DELETE /api/files/{file_id}"""

    async def test_delete_file_not_found(self, client):
        """Test deleting a file that doesn't exist."""
        fake_id = str(uuid.uuid4())
        response = await client.delete(f"/api/files/{fake_id}")
        assert response.status_code == 404

    async def test_delete_file_success(self, client, mock_storage, mock_celery):
        """Test successfully deleting a file."""
        mock_storage.upload_file = MagicMock(return_value="pdf/test/file.pdf")
        mock_storage.delete_file = MagicMock()

        # Upload first
        upload_resp = await client.post(
            "/api/files/upload",
            files={"file": ("test.pdf", b"%PDF-1.4", "application/pdf")},
        )
        file_id = upload_resp.json()["fileId"]

        # Delete
        with patch("vector_store.faiss_index.faiss_index") as mock_faiss:
            mock_faiss.delete_index = MagicMock()
            response = await client.delete(f"/api/files/{file_id}")

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

        # Verify it's gone
        get_resp = await client.get(f"/api/files/{file_id}")
        assert get_resp.status_code == 404

    async def test_delete_file_forbidden_for_other_user(self, client, mock_storage, mock_celery):
        """Test that a user cannot delete another user's file."""
        from models.database import async_session
        from models.file import File

        # Create a file owned by a different user
        file_id = str(uuid.uuid4())
        async with async_session() as session:
            f = File(
                file_id=uuid.UUID(file_id),
                file_name="not-mine.pdf",
                file_type="pdf",
                storage_key="key",
                created_by="other@example.com",
                status="ready",
            )
            session.add(f)
            await session.commit()

        response = await client.delete(f"/api/files/{file_id}")
        assert response.status_code == 403
        assert response.json()["detail"].lower() == "forbidden"


@pytest.mark.asyncio
class TestDailyUploadLimit:
    """Tests for the per-user daily upload limit."""

    async def test_upload_count_endpoint(self, client):
        """Test GET /api/files/upload-count with no uploads."""
        response = await client.get("/api/files/upload-count")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["limit"] == settings.MAX_FILES_PER_USER_PER_DAY
        assert data["remaining"] == settings.MAX_FILES_PER_USER_PER_DAY

    async def test_upload_count_after_uploads(self, client, mock_storage, mock_celery):
        """Test upload count increments after each upload."""
        mock_storage.upload_file = MagicMock(return_value="pdf/test/file.pdf")

        # Upload 2 files
        for i in range(2):
            resp = await client.post(
                "/api/files/upload",
                files={"file": (f"test{i}.pdf", b"%PDF-1.4", "application/pdf")},
                data={"file_name": f"File {i}"},
            )
            assert resp.status_code == 200

        response = await client.get("/api/files/upload-count")
        data = response.json()
        assert data["count"] == 2
        assert data["remaining"] == settings.MAX_FILES_PER_USER_PER_DAY - 2

    async def test_upload_blocked_after_limit(self, client, mock_storage, mock_celery):
        """Test that uploads are blocked after daily limit is reached."""
        mock_storage.upload_file = MagicMock(return_value="pdf/test/file.pdf")

        # Use a low limit for the test
        original_limit = settings.MAX_FILES_PER_USER_PER_DAY
        settings.MAX_FILES_PER_USER_PER_DAY = 3

        try:
            # Upload up to the limit
            for i in range(3):
                resp = await client.post(
                    "/api/files/upload",
                    files={"file": (f"test{i}.pdf", b"%PDF-1.4", "application/pdf")},
                    data={"file_name": f"File {i}"},
                )
                assert resp.status_code == 200

            # Next upload should be rejected
            resp = await client.post(
                "/api/files/upload",
                files={"file": ("extra.pdf", b"%PDF-1.4", "application/pdf")},
                data={"file_name": "Extra File"},
            )
            assert resp.status_code == 429
            assert "Daily upload limit" in resp.json()["detail"]
        finally:
            settings.MAX_FILES_PER_USER_PER_DAY = original_limit

    async def test_upload_count_remaining_zero(self, client, mock_storage, mock_celery):
        """Test remaining is 0 when limit reached."""
        mock_storage.upload_file = MagicMock(return_value="pdf/test/file.pdf")

        original_limit = settings.MAX_FILES_PER_USER_PER_DAY
        settings.MAX_FILES_PER_USER_PER_DAY = 2

        try:
            for i in range(2):
                await client.post(
                    "/api/files/upload",
                    files={"file": (f"test{i}.pdf", b"%PDF-1.4", "application/pdf")},
                    data={"file_name": f"File {i}"},
                )

            response = await client.get("/api/files/upload-count")
            data = response.json()
            assert data["remaining"] == 0
        finally:
            settings.MAX_FILES_PER_USER_PER_DAY = original_limit
