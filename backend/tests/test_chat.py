"""Tests for chat and summarization endpoints."""

import json
import uuid
from unittest.mock import MagicMock, AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from models.file import File as FileModel


@pytest.mark.asyncio
class TestChat:
    """Tests for /api/chat endpoints."""

    async def test_chat_models_endpoint_lists_available_models(self, client):
        """Test model picker metadata is available to the frontend."""
        response = await client.get("/api/chat/models")

        assert response.status_code == 200
        models = response.json()
        assert {model["id"] for model in models} == {
            "gpt-oss-120b",
            "gemma-4-31b",
            "zai-glm-4.7",
        }
        glm = next(model for model in models if model["id"] == "zai-glm-4.7")
        assert glm["name"] == "GLM 4.7"
        assert glm["reasoning"] is False
        assert glm["creditCost"] > 1

    async def test_chat_models_endpoint_is_public(self):
        """Test model picker metadata does not require a logged-in user."""
        from main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as public_client:
            response = await public_client.get("/api/chat/models")

        assert response.status_code == 200

    async def test_chat_credits_endpoint_returns_daily_budget(self, client):
        """Test credit usage metadata for the authenticated user."""
        with patch("routers.chat.usage_limiter.get_daily_units", new_callable=AsyncMock) as mock_used:
            mock_used.return_value = 7
            response = await client.get("/api/chat/credits")

        assert response.status_code == 200
        assert response.json() == {"used": 7, "limit": 30, "remaining": 23}

    async def test_chat_ask_stream(self, client, mock_embedding_service, create_owned_file):
        """Test chat ask endpoint returns streaming response."""
        file_id = await create_owned_file()

        response = await client.post(
            "/api/chat/ask",
            json={"question": "What is this about?", "file_id": file_id},
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

    async def test_chat_ask_content(self, client, mock_embedding_service, mock_ai_service, create_owned_file):
        """Test chat ask returns text content in SSE format."""
        file_id = await create_owned_file()

        response = await client.post(
            "/api/chat/ask",
            json={"question": "Explain this", "file_id": file_id},
        )

        content = response.text
        assert "data:" in content
        assert "[DONE]" in content

    async def test_chat_ask_with_timestamps(self, client, create_owned_file):
        """Test chat returns timestamp info for media files."""
        file_id = await create_owned_file(file_type="audio", file_name="test.mp3")

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

    async def test_chat_ask_empty_query(self, client, mock_embedding_service, create_owned_file):
        """Test chat with empty query."""
        file_id = await create_owned_file()
        response = await client.post(
            "/api/chat/ask",
            json={"question": "", "file_id": file_id},
        )
        assert response.status_code == 200

    async def test_chat_ask_file_not_found(self, client):
        """Test chat ask with non-existent file returns 404."""
        response = await client.post(
            "/api/chat/ask",
            json={"question": "Hello", "file_id": str(uuid.uuid4())},
        )
        assert response.status_code == 404

    async def test_chat_ask_missing_fields(self, client):
        """Test chat with missing required fields."""
        response = await client.post("/api/chat/ask", json={})
        assert response.status_code == 422

    async def test_chat_history_persists_after_ask(self, client, mock_embedding_service, mock_ai_service, create_owned_file):
        """Test successful chats are saved and returned later."""
        file_id = await create_owned_file()

        ask_response = await client.post(
            "/api/chat/ask",
            json={"question": "Remember this?", "file_id": file_id},
        )
        assert ask_response.status_code == 200

        history_response = await client.get(f"/api/chat/history/{file_id}")
        assert history_response.status_code == 200
        history = history_response.json()
        assert [message["role"] for message in history] == ["user", "assistant"]
        assert history[0]["content"] == "Remember this?"
        assert "test answer" in history[1]["content"]

    async def test_chat_daily_limit_blocks_after_configured_limit(
        self,
        client,
        mock_embedding_service,
        mock_ai_service,
        create_owned_file,
        monkeypatch,
    ):
        """Test per-user daily chat question limit."""
        file_id = await create_owned_file()
        monkeypatch.setattr("routers.chat.settings.CHAT_DAILY_LIMIT_PER_USER", 1)

        first = await client.post(
            "/api/chat/ask",
            json={"question": "First?", "file_id": file_id},
        )
        assert first.status_code == 200

        second = await client.post(
            "/api/chat/ask",
            json={"question": "Second?", "file_id": file_id},
        )
        assert second.status_code == 429
        assert "Daily chat limit reached" in second.text

    async def test_reasoning_model_consumes_more_credits(
        self,
        client,
        mock_embedding_service,
        mock_ai_service,
        create_owned_file,
        monkeypatch,
    ):
        """Test deep reasoning is blocked sooner by the credit budget."""
        file_id = await create_owned_file()
        monkeypatch.setattr("routers.chat.settings.LLM_DAILY_BUDGET_UNITS_PER_USER", 4)
        monkeypatch.setattr("routers.chat.settings.CHAT_FAST_CREDIT_COST", 1)
        monkeypatch.setattr("routers.chat.settings.CHAT_DEEP_CREDIT_COST", 3)

        with patch("routers.chat.usage_limiter._get_redis", new_callable=AsyncMock, return_value=None):
            routers_chat_limiter = __import__("routers.chat", fromlist=["usage_limiter"]).usage_limiter
            routers_chat_limiter._memory_daily_units.clear()

            first = await client.post(
                "/api/chat/ask",
                json={
                    "question": "Deep one?",
                    "file_id": file_id,
                    "model_id": "zai-glm-4.7",
                },
            )
            assert first.status_code == 200

            second = await client.post(
                "/api/chat/ask",
                json={
                    "question": "Deep two?",
                    "file_id": file_id,
                    "model_id": "zai-glm-4.7",
                },
            )
            assert second.status_code == 429
            assert "Daily credit limit reached" in second.text

    async def test_think_mode_adds_reasoning_credit_surcharge(
        self,
        client,
        mock_embedding_service,
        mock_ai_service,
        create_owned_file,
        monkeypatch,
    ):
        """Test Think mode enables reasoning and adds the 3-credit surcharge."""
        file_id = await create_owned_file()
        monkeypatch.setattr("routers.chat.settings.LLM_DAILY_BUDGET_UNITS_PER_USER", 4)
        monkeypatch.setattr("routers.chat.settings.CHAT_FAST_CREDIT_COST", 1)
        monkeypatch.setattr("routers.chat.settings.CHAT_DEEP_CREDIT_COST", 3)

        with patch("routers.chat.usage_limiter._get_redis", new_callable=AsyncMock, return_value=None):
            routers_chat_limiter = __import__("routers.chat", fromlist=["usage_limiter"]).usage_limiter
            routers_chat_limiter._memory_daily_units.clear()

            first = await client.post(
                "/api/chat/ask",
                json={
                    "question": "Think with the fast model?",
                    "file_id": file_id,
                    "model_id": "gpt-oss-120b",
                    "deep_mode": True,
                },
            )
            assert first.status_code == 200

            second = await client.post(
                "/api/chat/ask",
                json={
                    "question": "No credits left?",
                    "file_id": file_id,
                    "model_id": "gpt-oss-120b",
                    "deep_mode": True,
                },
            )
            assert second.status_code == 429
            assert "costs 4 credits" in second.text


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

    async def test_summarize_media(self, client, db_session):
        """Test summarizing a media file using its transcript."""
        file_id = str(uuid.uuid4())
        from models.file import File
        
        f = File(
            file_id=uuid.UUID(file_id),
            file_name="audio.mp3",
            file_type="audio",
            storage_key="key",
            created_by="test@example.com",
            transcript="This is a transcript of an audio file.",
            status="ready"
        )
        db_session.add(f)
        await db_session.commit()

        async def fake_stream(*args, **kwargs):
            yield "Summary "
            yield "chunk."

        mock_ai = MagicMock()
        # Use side_effect to ensure the generator function is called
        mock_ai.summarize_stream.side_effect = fake_stream

        with patch("routers.chat.ai_service", mock_ai):
            # Reduce sleep to speed up test
            with patch("asyncio.sleep", new_callable=AsyncMock):
                response = await client.post(
                    "/api/chat/summarize",
                    json={"file_id": file_id},
                )


        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

    async def test_summarize_media_no_transcript(self, client, db_session):
        """Test summarize media file with no transcript returns 400."""
        file_id = str(uuid.uuid4())
        from models.file import File
        
        f = File(
            file_id=uuid.UUID(file_id),
            file_name="audio.mp3",
            file_type="audio",
            storage_key="key",
            created_by="test@example.com",
            transcript=None,  # No transcript
            status="ready"
        )
        db_session.add(f)
        await db_session.commit()


        # We don't need to patch ai_service as it shouldn't be called
        response = await client.post(
            "/api/chat/summarize",
            json={"file_id": file_id},
        )

        assert response.status_code == 400




@pytest.mark.asyncio
class TestChatCache:
    """Tests for chat caching."""

    async def test_chat_ask_cached(self, client, create_owned_file):
        """Test chat ask returns cached response if available."""
        file_id = await create_owned_file()
        # Mock cache hit
        with patch("routers.chat.cache_service.get_json", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = "Cached answer"
            
            response = await client.post(
                "/api/chat/ask",
                json={"question": "Cached question", "file_id": file_id},
            )
            
            assert response.status_code == 200
            content = response.text
            assert "Cached answer" in content
