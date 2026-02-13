"""Tests for file upload, retrieval, listing, and deletion."""

import io
import uuid
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio


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

    async def test_list_files_filter_by_email(self, client, mock_storage, mock_celery):
        """Test filtering files by user email."""
        mock_storage.upload_file = MagicMock(return_value="pdf/test/file.pdf")
        mock_storage.get_presigned_url = MagicMock(return_value="https://minio/url")

        await client.post(
            "/api/files/upload",
            files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
        )

        response = await client.get("/api/files?user_email=test@example.com")
        assert response.status_code == 200

        response2 = await client.get("/api/files?user_email=other@example.com")
        assert response2.status_code == 200
        assert len(response2.json()) == 0


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
