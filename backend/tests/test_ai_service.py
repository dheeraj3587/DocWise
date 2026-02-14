"""Tests for services.ai_service — AIService."""

from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from services.ai_service import AIService


class TestAIServiceGetLlm:
    """Tests for _get_llm model selection."""

    @patch("services.ai_service.AzureChatOpenAI")
    def test_normal_streaming(self, mock_cls):
        svc = AIService()
        result = svc._get_llm(deep_mode=False, sync=False)
        assert result is svc.llm

    @patch("services.ai_service.AzureChatOpenAI")
    def test_normal_sync(self, mock_cls):
        svc = AIService()
        result = svc._get_llm(deep_mode=False, sync=True)
        assert result is svc.llm_sync

    @patch("services.ai_service.AzureChatOpenAI")
    def test_deep_streaming(self, mock_cls):
        svc = AIService()
        result = svc._get_llm(deep_mode=True, sync=False)
        assert result is svc.llm_deep

    @patch("services.ai_service.AzureChatOpenAI")
    def test_deep_sync(self, mock_cls):
        svc = AIService()
        result = svc._get_llm(deep_mode=True, sync=True)
        assert result is svc.llm_deep_sync


@pytest.mark.asyncio
class TestAIServiceChat:
    """Tests for chat_stream, chat_no_context, summarize, summarize_stream."""

    @patch("services.ai_service.AzureChatOpenAI")
    async def test_chat_stream_yields_chunks(self, mock_cls):
        svc = AIService()
        mock_chunk1 = MagicMock()
        mock_chunk1.content = "Hello "
        mock_chunk2 = MagicMock()
        mock_chunk2.content = "world"

        async def mock_astream(prompt):
            yield mock_chunk1
            yield mock_chunk2

        svc.llm.astream = mock_astream

        context = [{"text": "some context", "score": 0.9}]
        chunks = []
        async for chunk in svc.chat_stream("What?", context):
            chunks.append(chunk)

        assert chunks == ["Hello ", "world"]

    @patch("services.ai_service.AzureChatOpenAI")
    async def test_chat_stream_with_timestamps(self, mock_cls):
        svc = AIService()
        mock_chunk = MagicMock()
        mock_chunk.content = "Answer"

        async def mock_astream(prompt):
            # Verify timestamp instruction is in the prompt
            assert "timestamp" in prompt.lower() or "MM:SS" in prompt
            yield mock_chunk

        svc.llm.astream = mock_astream

        context = [
            {"text": "segment", "start_time": 10.0, "end_time": 20.0},
        ]
        chunks = []
        async for chunk in svc.chat_stream("What?", context):
            chunks.append(chunk)

        assert len(chunks) == 1

    @patch("services.ai_service.AzureChatOpenAI")
    async def test_chat_no_context(self, mock_cls):
        svc = AIService()
        mock_chunk = MagicMock()
        mock_chunk.content = "response"

        async def mock_astream(prompt):
            yield mock_chunk

        svc.llm.astream = mock_astream

        chunks = []
        async for chunk in svc.chat_no_context("Hello"):
            chunks.append(chunk)

        assert chunks == ["response"]

    @patch("services.ai_service.AzureChatOpenAI")
    async def test_chat_stream_skips_empty_content(self, mock_cls):
        svc = AIService()
        mock_chunk_empty = MagicMock()
        mock_chunk_empty.content = ""
        mock_chunk_good = MagicMock()
        mock_chunk_good.content = "data"

        async def mock_astream(prompt):
            yield mock_chunk_empty
            yield mock_chunk_good

        svc.llm.astream = mock_astream

        chunks = []
        async for chunk in svc.chat_no_context("test"):
            chunks.append(chunk)

        assert chunks == ["data"]

    @patch("services.ai_service.AzureChatOpenAI")
    async def test_summarize(self, mock_cls):
        svc = AIService()
        mock_response = MagicMock()
        mock_response.content = "Summary text"
        svc.llm_sync.ainvoke = AsyncMock(return_value=mock_response)

        result = await svc.summarize("Long document text")
        assert result == "Summary text"

    @patch("services.ai_service.AzureChatOpenAI")
    async def test_summarize_stream(self, mock_cls):
        svc = AIService()
        mock_chunk = MagicMock()
        mock_chunk.content = "Summary"

        async def mock_astream(prompt):
            yield mock_chunk

        svc.llm.astream = mock_astream

        chunks = []
        async for chunk in svc.summarize_stream("text"):
            chunks.append(chunk)

        assert chunks == ["Summary"]
