"""Tests for chat and summarization endpoints."""

import uuid
from unittest.mock import MagicMock, AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


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
            "tencent/hy3",
            "nvidia/nemotron-3-ultra-550b-a55b:free",
            "nvidia/nemotron-3-super-120b-a12b:free",
            "nvidia/nemotron-3-nano-30b-a3b:free",
            "poolside/laguna-s-2.1:free",
            "cohere/north-mini-code:free",
        }
        glm = next(model for model in models if model["id"] == "zai-glm-4.7")
        assert glm["name"] == "GLM 4.7"
        assert glm["reasoning"] is False
        assert glm["creditCost"] > 1
        assert glm["contextWindow"] > 0
        assert glm["outputReserveTokens"] > 0
        tencent = next(model for model in models if model["id"] == "tencent/hy3")
        assert tencent["name"] == "Tencent HY3"
        assert tencent["provider"] == "openrouter"
        assert tencent["providerLabel"] == "OpenRouter"
        assert tencent["creditCost"] == 1
        assert tencent["contextWindow"] == 262144
        assert tencent["outputReserveTokens"] > 0

        ultra = next(
            model
            for model in models
            if model["id"] == "nvidia/nemotron-3-ultra-550b-a55b:free"
        )
        assert ultra["contextWindow"] == 1_000_000
        assert ultra["reasoningEfforts"] == ["low", "medium", "high"]

        # Thinks, but has no effort dial — the picker must not offer one.
        nano = next(
            model
            for model in models
            if model["id"] == "nvidia/nemotron-3-nano-30b-a3b:free"
        )
        assert nano["reasoningEfforts"] == []

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

    async def test_chat_ask_without_file_uses_general_chat(
        self,
        client,
        mock_embedding_service,
        mock_ai_service,
    ):
        """Test /chat can ask a general question without document context."""
        response = await client.post(
            "/api/chat/ask",
            json={"question": "What is retrieval augmented generation?"},
        )

        assert response.status_code == 200
        assert "data:" in response.text
        assert "[DONE]" in response.text
        mock_embedding_service.search_similar.assert_not_called()

    async def test_chat_ask_with_timestamps(
        self, client, mock_embedding_service, create_owned_file
    ):
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

    async def test_openrouter_model_routes_provider_to_ai_service(
        self,
        client,
        monkeypatch,
    ):
        """Test OpenRouter model requests are passed through with provider metadata."""
        captured = {}

        async def fake_no_context(*args, **kwargs):
            captured.update(kwargs)
            yield "openrouter answer"

        monkeypatch.setattr("routers.chat.ai_service.chat_no_context", fake_no_context)

        response = await client.post(
            "/api/chat/ask",
            json={
                "question": "Use Tencent",
                "model_id": "tencent/hy3",
                "deep_mode": True,
            },
        )

        assert response.status_code == 200
        assert "openrouter answer" in response.text
        assert captured["model"] == "tencent/hy3"
        assert captured["provider"] == "openrouter"
        assert captured["deep_mode"] is True
        assert captured["reasoning_effort"] == "medium"

    async def test_requested_reasoning_effort_reaches_the_provider(
        self,
        client,
        monkeypatch,
    ):
        """Test an explicit effort level overrides the model default."""
        captured = {}

        async def fake_no_context(*args, **kwargs):
            captured.update(kwargs)
            yield "answer"

        monkeypatch.setattr("routers.chat.ai_service.chat_no_context", fake_no_context)

        response = await client.post(
            "/api/chat/ask",
            json={
                "question": "Think hard",
                "model_id": "tencent/hy3",
                "deep_mode": True,
                "reasoning_effort": "high",
            },
        )

        assert response.status_code == 200
        assert captured["reasoning_effort"] == "high"

    async def test_reasoning_effort_is_dropped_for_models_without_a_dial(
        self,
        client,
        monkeypatch,
    ):
        """Test we never send an effort a model would reject."""
        captured = {}

        async def fake_no_context(*args, **kwargs):
            captured.update(kwargs)
            yield "answer"

        monkeypatch.setattr("routers.chat.ai_service.chat_no_context", fake_no_context)

        response = await client.post(
            "/api/chat/ask",
            json={
                "question": "Think hard",
                "model_id": "nvidia/nemotron-3-nano-30b-a3b:free",
                "deep_mode": True,
                "reasoning_effort": "high",
            },
        )

        assert response.status_code == 200
        assert captured["reasoning_effort"] is None

    async def test_openrouter_model_requires_configured_key(
        self,
        client,
        monkeypatch,
    ):
        """Test missing OpenRouter credentials fail before streaming starts."""
        monkeypatch.setattr("routers.chat.settings.OPENROUTER_API_KEY", "")

        response = await client.post(
            "/api/chat/ask",
            json={
                "question": "Use Tencent",
                "model_id": "tencent/hy3",
            },
        )

        assert response.status_code == 503
        assert "OPENROUTER_API_KEY" in response.text


@pytest.mark.asyncio
class TestDocumentTopics:
    """Tests for PDF topic navigation metadata."""

    async def test_get_document_topics_returns_empty_for_non_pdf(self, client, create_owned_file):
        """Test non-PDF files skip topic generation."""
        file_id = await create_owned_file(file_type="audio", file_name="call.mp3")

        response = await client.get(f"/api/chat/topics/{file_id}")

        assert response.status_code == 200
        assert response.json() == []

    async def test_get_document_topics_returns_cached_outline(self, client, create_owned_file):
        """Test cached topic outlines return without parsing the PDF again."""
        file_id = await create_owned_file()
        cached = [{"title": "Cached Topic", "page": 1, "summary": "Already generated"}]

        with patch("routers.chat.cache_service.get_json", new_callable=AsyncMock, return_value=cached), \
             patch("routers.chat.storage_service.download_file") as mock_download:
            response = await client.get(f"/api/chat/topics/{file_id}")

        assert response.status_code == 200
        assert response.json() == cached
        mock_download.assert_not_called()

    async def test_get_document_topics_generates_and_normalizes_outline(self, client, create_owned_file):
        """Test PDF topics are generated, clamped to valid pages, and cached."""
        file_id = await create_owned_file()
        pages = [
            {"page": 1, "text": "Introduction\n" + ("attention " * 20)},
            {"page": 2, "text": "Methods " + ("training " * 20)},
        ]
        generated = [
            {"title": "Overview", "page": 1, "summary": "Opening context"},
            {"title": "Training Details", "page": 99, "summary": "Clamped to final page"},
            {"title": "", "page": 1, "summary": "Ignored"},
        ]

        with patch("routers.chat.cache_service.get_json", new_callable=AsyncMock, return_value=None), \
             patch("routers.chat.cache_service.set_json", new_callable=AsyncMock) as mock_set, \
             patch("routers.chat.storage_service.download_file", return_value=b"%PDF"), \
             patch("routers.chat.pdf_service.extract_pages", return_value=pages), \
             patch("routers.chat.ai_service.categorize_pdf_topics", new_callable=AsyncMock, return_value=generated):
            response = await client.get(f"/api/chat/topics/{file_id}")

        assert response.status_code == 200
        assert response.json() == [
            {"title": "Overview", "page": 1, "summary": "Opening context"},
            {"title": "Training Details", "page": 2, "summary": "Clamped to final page"},
        ]
        mock_set.assert_awaited_once()

    async def test_get_document_topics_falls_back_when_generation_fails(self, client, create_owned_file):
        """Test topic generation errors still produce a usable document-start topic."""
        file_id = await create_owned_file()

        with patch("routers.chat.cache_service.get_json", new_callable=AsyncMock, return_value=None), \
             patch("routers.chat.cache_service.set_json", new_callable=AsyncMock), \
             patch("routers.chat.storage_service.download_file", return_value=b"%PDF"), \
             patch("routers.chat.pdf_service.extract_pages", return_value=[{"page": 1, "text": "Content"}]), \
             patch("routers.chat.ai_service.categorize_pdf_topics", new_callable=AsyncMock, side_effect=Exception("offline")):
            response = await client.get(f"/api/chat/topics/{file_id}")

        assert response.status_code == 200
        assert response.json() == [{"title": "Document start", "page": 1, "summary": ""}]

    async def test_get_document_topics_returns_empty_for_pdf_without_pages(self, client, create_owned_file):
        """Test empty PDF extraction returns no topics."""
        file_id = await create_owned_file()

        with patch("routers.chat.cache_service.get_json", new_callable=AsyncMock, return_value=None), \
             patch("routers.chat.storage_service.download_file", return_value=b"%PDF"), \
             patch("routers.chat.pdf_service.extract_pages", return_value=[]):
            response = await client.get(f"/api/chat/topics/{file_id}")

        assert response.status_code == 200
        assert response.json() == []


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
