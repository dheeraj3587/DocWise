"""Tests for services.timestamp_service — TimestampService."""

import json
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from services.timestamp_service import TimestampService


@pytest.mark.asyncio
class TestTimestampService:
    """Tests for TimestampService.extract_topics."""

    @patch("services.timestamp_service.AzureChatOpenAI")
    async def test_extract_topics_empty_input(self, mock_cls):
        svc = TimestampService()
        result = await svc.extract_topics([])
        assert result == []

    @patch("services.timestamp_service.AzureChatOpenAI")
    async def test_extract_topics_valid_json(self, mock_cls):
        svc = TimestampService()
        topics = json.dumps([
            {"topic": "Intro", "start_time": 0.0, "end_time": 30.0},
            {"topic": "Main", "start_time": 30.0, "end_time": 120.0},
        ])
        mock_response = MagicMock()
        mock_response.content = topics
        svc.llm = MagicMock()
        svc.llm.ainvoke = AsyncMock(return_value=mock_response)

        segments = [
            {"start": 0.0, "end": 30.0, "text": "Welcome to the show"},
            {"start": 30.0, "end": 120.0, "text": "Today's main topic"},
        ]
        result = await svc.extract_topics(segments)

        assert len(result) == 2
        assert result[0]["topic"] == "Intro"
        assert result[1]["start_time"] == 30.0

    @patch("services.timestamp_service.AzureChatOpenAI")
    async def test_extract_topics_invalid_json_returns_empty(self, mock_cls):
        svc = TimestampService()
        mock_response = MagicMock()
        mock_response.content = "not valid json at all"
        svc.llm = MagicMock()
        svc.llm.ainvoke = AsyncMock(return_value=mock_response)

        segments = [{"start": 0.0, "end": 5.0, "text": "something"}]
        result = await svc.extract_topics(segments)
        assert result == []

    @patch("services.timestamp_service.AzureChatOpenAI")
    async def test_extract_topics_markdown_wrapped_json(self, mock_cls):
        svc = TimestampService()
        topics = json.dumps([{"topic": "X", "start_time": 0.0, "end_time": 5.0}])
        mock_response = MagicMock()
        mock_response.content = f"```json\n{topics}\n```"
        svc.llm = MagicMock()
        svc.llm.ainvoke = AsyncMock(return_value=mock_response)

        segments = [{"start": 0.0, "end": 5.0, "text": "text"}]
        result = await svc.extract_topics(segments)

        assert len(result) == 1
        assert result[0]["topic"] == "X"

    @patch("services.timestamp_service.AzureChatOpenAI")
    async def test_extract_topics_llm_exception_propagates(self, mock_cls):
        svc = TimestampService()
        svc.llm = MagicMock()
        svc.llm.ainvoke = AsyncMock(side_effect=RuntimeError("LLM error"))

        segments = [{"start": 0.0, "end": 5.0, "text": "text"}]
        with pytest.raises(RuntimeError, match="LLM error"):
            await svc.extract_topics(segments)
