"""Tests for chat and summarization endpoints."""

import json
import uuid
from unittest.mock import MagicMock, AsyncMock, patch

import pytest

from models.file import File as FileModel


@pytest.mark.asyncio
class TestChat:
    """Tests for /api/chat endpoints."""

    async def test_chat_ask_stream(self, client, mock_embedding_service):
        """Test chat ask endpoint returns streaming response."""
        file_id = str(uuid.uuid4())

        response = await client.post(
            "/api/chat/ask",
            json={"question": "What is this about?", "file_id": file_id},
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

    async def test_chat_ask_content(self, client, mock_embedding_service, mock_ai_service):
        """Test chat ask returns text content in SSE format."""
        file_id = str(uuid.uuid4())

        response = await client.post(
            "/api/chat/ask",
            json={"question": "Explain this", "file_id": file_id},
        )

        content = response.text
        assert "data:" in content
        assert "[DONE]" in content

    async def test_chat_ask_with_timestamps(self, client):
        """Test chat returns timestamp info for media files."""
        file_id = str(uuid.uuid4())

        with patch("routers.chat.embedding_service") as mock_embed:
            mock_embed.search_similar = MagicMock(
                return_value=[
                    {
                        "text": "segment text",
                        "score": 0.9,
                        "start_time": 10.0,
                        "end_time": 25.0,
                        "file_id": file_id,
                    }
                ]
            )

            response = await client.post(
                "/api/chat/ask",
                json={"question": "What happens at the beginning?", "file_id": file_id},
            )

            assert response.status_code == 200
            content = response.text
            assert "data:" in content

    async def test_chat_ask_empty_query(self, client, mock_embedding_service):
        """Test chat with empty query."""
        response = await client.post(
            "/api/chat/ask",
            json={"question": "", "file_id": str(uuid.uuid4())},
        )
        assert response.status_code == 200

    async def test_chat_ask_missing_fields(self, client):
        """Test chat with missing required fields."""
        response = await client.post("/api/chat/ask", json={})
        assert response.status_code == 422


@pytest.mark.asyncio
class TestSummarize:
    """Tests for /api/chat/summarize endpoint."""

    async def test_summarize_file_not_found(self, client):
        """Test summarize with non-existent file."""
        response = await client.post(
            "/api/chat/summarize",
            json={"file_id": str(uuid.uuid4())},
        )
        assert response.status_code == 404

    async def test_summarize_pdf(self, client, mock_storage, mock_celery, mock_pdf_service, mock_ai_service):
        """Test summarizing a PDF file."""
        mock_storage.upload_file = MagicMock(return_value="pdf/test/file.pdf")
        mock_storage.download_file = MagicMock(return_value=b"%PDF-1.4 test content")

        # Upload file first
        upload_resp = await client.post(
            "/api/files/upload",
            files={"file": ("test.pdf", b"%PDF-1.4 test", "application/pdf")},
        )
        file_id = upload_resp.json()["fileId"]

        response = await client.post(
            "/api/chat/summarize",
            json={"file_id": file_id},
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

    async def test_summarize_missing_file_id(self, client):
        """Test summarize without file_id."""
        response = await client.post("/api/chat/summarize", json={})
        assert response.status_code == 422
