"""Tests for services.ai_service - AIService."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.ai_service import AIService


class _AsyncChunks:
    def __init__(self, chunks):
        self.chunks = chunks

    def __aiter__(self):
        self._iter = iter(self.chunks)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


def _stream_chunk(text):
    delta = MagicMock()
    delta.content = text
    choice = MagicMock()
    choice.delta = delta
    chunk = MagicMock()
    chunk.choices = [choice]
    return chunk


def _completion_response(text):
    message = MagicMock()
    message.content = text
    choice = MagicMock()
    choice.message = message
    response = MagicMock()
    response.choices = [choice]
    return response


class TestAIServiceModelSelection:
    """Tests for model selection."""

    @patch("services.ai_service.settings")
    @patch("services.ai_service.AsyncOpenAI")
    def test_normal_model(self, mock_client, mock_settings):
        mock_settings.CEREBRAS_CHAT_MODEL = "chat-model"
        mock_settings.CEREBRAS_DEEP_MODEL = "deep-model"
        svc = AIService()
        assert svc._get_model(deep_mode=False) == "chat-model"

    @patch("services.ai_service.settings")
    @patch("services.ai_service.AsyncOpenAI")
    def test_deep_model(self, mock_client, mock_settings):
        mock_settings.CEREBRAS_CHAT_MODEL = "chat-model"
        mock_settings.CEREBRAS_DEEP_MODEL = "deep-model"
        svc = AIService()
        assert svc._get_model(deep_mode=True) == "deep-model"

    @patch("services.ai_service.settings")
    @patch("services.ai_service.AsyncOpenAI")
    def test_reasoning_effort_by_mode(self, mock_client, mock_settings):
        mock_settings.CEREBRAS_REASONING_EFFORT = "low"
        mock_settings.CEREBRAS_CHAT_REASONING_EFFORT = "low"
        mock_settings.CEREBRAS_DEEP_REASONING_EFFORT = "high"
        svc = AIService()
        assert svc._get_reasoning_effort(deep_mode=False) == "low"
        assert svc._get_reasoning_effort(deep_mode=True) == "high"

    @patch("services.ai_service.settings")
    @patch("services.ai_service.AsyncOpenAI")
    def test_explicit_model_and_reasoning_override(self, mock_client, mock_settings):
        mock_settings.CEREBRAS_REASONING_EFFORT = "low"
        mock_settings.CEREBRAS_CHAT_REASONING_EFFORT = "low"
        mock_settings.CEREBRAS_DEEP_REASONING_EFFORT = "high"
        svc = AIService()
        assert svc._get_model(deep_mode=False, model="zai-glm-4.7") == "zai-glm-4.7"
        assert svc._get_reasoning_effort(
            deep_mode=False,
            reasoning_effort="high",
        ) == "high"


@pytest.mark.asyncio
class TestAIServiceChat:
    """Tests for chat_stream, chat_no_context, summarize, summarize_stream."""

    @patch("services.ai_service.AsyncOpenAI")
    async def test_chat_stream_yields_chunks(self, mock_client_cls):
        svc = AIService()
        svc.client.chat.completions.create = AsyncMock(
            return_value=_AsyncChunks([_stream_chunk("Hello "), _stream_chunk("world")])
        )

        context = [{"text": "some context", "score": 0.9}]
        chunks = []
        async for chunk in svc.chat_stream("What?", context):
            chunks.append(chunk)

        assert chunks == ["Hello ", "world"]
        svc.client.chat.completions.create.assert_awaited()

    @patch("services.ai_service.AsyncOpenAI")
    async def test_chat_stream_with_timestamps(self, mock_client_cls):
        svc = AIService()

        async def create(**kwargs):
            prompt = "\n".join(message["content"] for message in kwargs["messages"])
            assert "timestamp" in prompt.lower() or "MM:SS" in prompt
            return _AsyncChunks([_stream_chunk("Answer")])

        svc.client.chat.completions.create = AsyncMock(side_effect=create)

        context = [{"text": "segment", "start_time": 10.0, "end_time": 20.0}]
        chunks = []
        async for chunk in svc.chat_stream("What?", context):
            chunks.append(chunk)

        assert chunks == ["Answer"]

    @patch("services.ai_service.AsyncOpenAI")
    async def test_chat_no_context(self, mock_client_cls):
        svc = AIService()
        svc.client.chat.completions.create = AsyncMock(
            return_value=_AsyncChunks([_stream_chunk("response")])
        )

        chunks = []
        async for chunk in svc.chat_no_context("Hello"):
            chunks.append(chunk)

        assert chunks == ["response"]
        messages = svc.client.chat.completions.create.await_args.kwargs["messages"]
        assert messages[0]["role"] == "system"
        assert "general chat mode" in messages[1]["content"]

    @patch("services.ai_service.AsyncOpenAI")
    async def test_chat_stream_skips_empty_content(self, mock_client_cls):
        svc = AIService()
        svc.client.chat.completions.create = AsyncMock(
            return_value=_AsyncChunks([_stream_chunk(""), _stream_chunk("data")])
        )

        chunks = []
        async for chunk in svc.chat_no_context("test"):
            chunks.append(chunk)

        assert chunks == ["data"]

    @patch("services.ai_service.AsyncOpenAI")
    async def test_summarize(self, mock_client_cls):
        svc = AIService()
        svc.client.chat.completions.create = AsyncMock(
            return_value=_completion_response("Summary text")
        )

        result = await svc.summarize("Long document text")
        assert result == "Summary text"

    @patch("services.ai_service.AsyncOpenAI")
    async def test_summarize_stream(self, mock_client_cls):
        svc = AIService()
        svc.client.chat.completions.create = AsyncMock(
            return_value=_AsyncChunks([_stream_chunk("Summary")])
        )

        chunks = []
        async for chunk in svc.summarize_stream("text"):
            chunks.append(chunk)

        assert chunks == ["Summary"]


@pytest.mark.asyncio
class TestAIServiceTopicCategorization:
    """Tests for PDF topic outline parsing."""

    @patch("services.ai_service.AsyncOpenAI")
    async def test_categorize_pdf_topics_parses_markdown_json(self, mock_client_cls):
        svc = AIService()
        svc._complete_prompt = AsyncMock(
            return_value='```json\n[{"topic":"Attention Blocks","page":"2","summary":"Transformer core"}, {"title":"Training","page":"bad","summary":"x"}]\n```'
        )

        topics = await svc.categorize_pdf_topics("Page 2: attention")

        assert topics == [
            {"title": "Attention Blocks", "summary": "Transformer core", "page": 2},
            {"title": "Training", "summary": "x", "page": 1},
        ]

    @patch("services.ai_service.AsyncOpenAI")
    async def test_categorize_pdf_topics_ignores_invalid_items_and_limits_output(self, mock_client_cls):
        svc = AIService()
        payload = [{"title": f"Topic {i}", "page": i, "summary": "s" * 250} for i in range(12)]
        payload.insert(1, "not a topic")
        svc._complete_prompt = AsyncMock(return_value=str(payload).replace("'", '"'))

        topics = await svc.categorize_pdf_topics("Page 1: overview")

        assert len(topics) == 9
        assert topics[0]["title"] == "Topic 0"
        assert topics[0]["page"] == 1
        assert len(topics[0]["summary"]) == 180

    @patch("services.ai_service.AsyncOpenAI")
    async def test_categorize_pdf_topics_returns_empty_for_non_list_json(self, mock_client_cls):
        svc = AIService()
        svc._complete_prompt = AsyncMock(return_value='{"title":"Not a list"}')

        topics = await svc.categorize_pdf_topics("Page 1: overview")

        assert topics == []
