"""Bounded agent tools, provider assembly, persistence, and API contracts."""

from __future__ import annotations

import asyncio
import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from sqlalchemy import func, select

from core.config import settings
from models.conversation import (
    ConversationMessage,
    DocumentChunk,
    MessageCitation,
    ToolInvocation,
    UsageLedger,
)
from routers.conversations import _persist_citations
from services.agent_tool_service import (
    AgentToolContext,
    AgentToolError,
    _safe_calculate,
    agent_tool_service,
)
from services.citation_service import (
    citation_payloads,
    format_sources,
    strip_unknown_citations,
)
from services.model_registry import resolve_chat_model
from services.provider_service import ProviderService, ProviderUnavailable
from services.tavily_service import TavilyService, TavilyUnavailable
from tests.conftest import MOCK_USER, test_session_factory


def _events(response) -> list[dict]:
    events: list[dict] = []
    for block in response.text.split("\n\n"):
        data = next(
            (
                line.removeprefix("data: ")
                for line in block.splitlines()
                if line.startswith("data: ")
            ),
            None,
        )
        if data:
            events.append(json.loads(data))
    return events


def _context(*, file_ids: list[uuid.UUID] | None = None) -> AgentToolContext:
    file_ids = file_ids or []
    return AgentToolContext(
        owner_sub=MOCK_USER["sub"],
        conversation_id=uuid.uuid4(),
        selected_file_ids=file_ids,
        selected_documents=[
            {
                "file_id": file_id,
                "file_name": f"{file_id}.pdf",
                "file_type": "pdf",
            }
            for file_id in file_ids
        ],
    )


async def _create_conversation(client, document_ids: list[str] | None = None) -> dict:
    document_ids = document_ids or []
    response = await client.post(
        "/api/chat/conversations",
        json={
            "mode": "document" if document_ids else "general",
            "documentIds": document_ids,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
class TestAgentToolService:
    async def test_tool_definitions_and_strict_argument_validation(self, monkeypatch):
        context = _context(file_ids=[uuid.uuid4()])
        monkeypatch.setattr(settings, "TAVILY_API_KEY", "configured")
        definitions = agent_tool_service.definitions(context)
        names = [definition["function"]["name"] for definition in definitions]
        assert names == [
            "list_selected_documents",
            "search_selected_documents",
            "inspect_document_passage",
            "calculate",
            "get_datetime",
            "search_web",
            "inspect_web_source",
        ]
        assert all(
            definition["function"]["parameters"]["additionalProperties"] is False
            and set(definition["function"]["parameters"]["required"])
            == set(definition["function"]["parameters"]["properties"])
            and definition["function"]["strict"] is True
            for definition in definitions
        )
        encoded_schemas = json.dumps(
            [definition["function"]["parameters"] for definition in definitions]
        )
        assert all(
            keyword not in encoded_schemas
            for keyword in (
                "default",
                "format",
                "maxLength",
                "minLength",
                "title",
            )
        )
        assert agent_tool_service.validate_arguments(
            "calculate", '{"expression":"2 + 2"}'
        ) == {"expression": "2 + 2"}
        with pytest.raises(AgentToolError, match="invalid"):
            agent_tool_service.validate_arguments(
                "calculate", {"expression": "2", "unexpected": True}
            )
        with pytest.raises(AgentToolError, match="not available"):
            agent_tool_service.validate_arguments("delete_everything", {})

    async def test_calculator_datetime_and_bounded_results(self, db_session, monkeypatch):
        context = _context()
        calculated = await agent_tool_service.execute(
            db_session,
            name="calculate",
            arguments={"expression": "(12 / 3) ** 2"},
            context=context,
        )
        assert json.loads(calculated.content)["result"] == 16.0
        current = await agent_tool_service.execute(
            db_session,
            name="get_datetime",
            arguments={"timezone": "Asia/Kolkata"},
            context=context,
        )
        assert json.loads(current.content)["timezone"] == "Asia/Kolkata"
        with pytest.raises(AgentToolError, match="Unknown"):
            await agent_tool_service.execute(
                db_session,
                name="get_datetime",
                arguments={"timezone": "Moon/Sea_of_Tranquility"},
                context=context,
            )
        with pytest.raises(AgentToolError):
            _safe_calculate("__import__('os').system('id')")
        with pytest.raises(AgentToolError):
            _safe_calculate("2 ** 99")
        with pytest.raises(AgentToolError):
            _safe_calculate("1 / 0")
        with pytest.raises(AgentToolError):
            _safe_calculate("1 +")
        with pytest.raises(AgentToolError):
            _safe_calculate("1e100 * 100")
        assert _safe_calculate("-2") == -2

        monkeypatch.setattr(settings, "AGENT_MAX_TOOL_RESULT_CHARS", 120)
        bounded = agent_tool_service._result(
            {"value": "x" * 1000}, {"message": "bounded"}
        )
        assert json.loads(bounded.content)["truncated"] is True

    async def test_tool_dispatch_errors_and_source_updates(self, db_session):
        context = _context()
        listed = await agent_tool_service.execute(
            db_session,
            name="list_selected_documents",
            arguments={},
            context=context,
        )
        assert json.loads(listed.content) == {"documents": []}
        with pytest.raises(AgentToolError, match="No documents"):
            await agent_tool_service.execute(
                db_session,
                name="search_selected_documents",
                arguments={"query": "x", "limit": 1},
                context=context,
            )
        with pytest.raises(AgentToolError, match="invalid"):
            agent_tool_service.validate_arguments("calculate", "[]")
        with pytest.raises(AgentToolError, match="not available"):
            await agent_tool_service.execute(
                db_session,
                name="unknown",
                arguments={},
                context=context,
            )

        first = context.add_web_sources(
            [{"url": "https://example.com", "title": "Example", "text": "short"}]
        )
        second = context.add_web_sources(
            [
                {
                    "url": "https://example.com",
                    "title": "Example",
                    "text": "a much longer source excerpt",
                }
            ]
        )
        assert first[0]["label"] == second[0]["label"] == "W1"
        assert second[0]["text"] == "a much longer source excerpt"

        formatted = format_sources(
            [
                second[0],
                {
                    "label": "S1",
                    "file_name": "recording.mp3",
                    "text": "spoken evidence",
                    "start_time": 3,
                    "end_time": 8,
                },
            ]
        )
        assert "https://example.com" in formatted
        assert "3.0s-8.0s" in formatted
        assert citation_payloads("Unknown [[S9]]", [second[0]]) == []
        assert strip_unknown_citations("Unknown [[S9]]", [second[0]]) == "Unknown"
        assert strip_unknown_citations("Known [[W1]]", [second[0]]) == "Known [[W1]]"

    async def test_web_provider_failures_remain_bounded(self, db_session, monkeypatch):
        context = _context()
        search = AsyncMock(side_effect=TavilyUnavailable("provider offline"))
        with patch("services.agent_tool_service.tavily_service.search", search):
            with pytest.raises(AgentToolError, match="provider offline"):
                await agent_tool_service.execute(
                    db_session,
                    name="search_web",
                    arguments={"query": "research", "maxResults": 2, "timeRange": None},
                    context=context,
                )

        context = _context()
        context.discovered_web_urls.add("https://example.com/source")
        context.evidence.append(
            {
                "id": "web:test",
                "label": "W1",
                "source_type": "web",
                "web_url": "https://example.com/source",
                "web_title": "Source",
                "web_domain": "example.com",
                "text": "snippet",
            }
        )
        extract = AsyncMock(side_effect=TavilyUnavailable("extract offline"))
        with patch("services.agent_tool_service.tavily_service.extract", extract):
            with pytest.raises(AgentToolError, match="extract offline"):
                await agent_tool_service.execute(
                    db_session,
                    name="inspect_web_source",
                    arguments={"url": "https://example.com/source", "query": None},
                    context=context,
                )
        monkeypatch.setattr(settings, "AGENT_MAX_WEB_INSPECTIONS", 1)
        context.web_inspections = 1
        with pytest.raises(AgentToolError, match="limit"):
            await agent_tool_service.execute(
                db_session,
                name="inspect_web_source",
                arguments={"url": "https://example.com/source", "query": None},
                context=context,
            )

    async def test_document_tools_cannot_escape_selected_files(
        self, create_owned_file
    ):
        selected_id = uuid.UUID(await create_owned_file(file_name="selected.pdf"))
        other_id = uuid.UUID(await create_owned_file(file_name="private.pdf"))
        selected_chunk = uuid.uuid4()
        other_chunk = uuid.uuid4()
        async with test_session_factory() as db:
            for chunk_id, file_id, ordinal in (
                (selected_chunk, selected_id, 0),
                (other_chunk, other_id, 0),
            ):
                db.add(
                    DocumentChunk(
                        id=chunk_id,
                        file_id=file_id,
                        owner_sub=MOCK_USER["sub"],
                        ordinal=ordinal,
                        text="bounded source text",
                        search_text="bounded source text",
                        page_start=1,
                        page_end=1,
                        content_hash=str(chunk_id).replace("-", "") * 2,
                        embedding_model="test",
                        embedding_version="test",
                        embedding=[0.1] * 384,
                    )
                )
            await db.commit()

        context = _context(file_ids=[selected_id])
        source = {
            "id": str(selected_chunk),
            "file_id": str(selected_id),
            "text": "bounded source text",
            "page_start": 1,
            "page_end": 1,
            "start_time": None,
            "end_time": None,
            "score": 0.9,
            "rank": 1,
            "ordinal": 0,
        }
        search = AsyncMock(return_value=[source])
        with patch(
            "services.agent_tool_service.document_index_service.search", search
        ):
            async with test_session_factory() as db:
                result = await agent_tool_service.execute(
                    db,
                    name="search_selected_documents",
                    arguments={"query": "bounded", "limit": 4},
                    context=context,
                )
        assert json.loads(result.content)["results"][0]["label"] == "S1"
        assert search.await_args.kwargs["file_ids"] == [selected_id]

        async with test_session_factory() as db:
            inspected = await agent_tool_service.execute(
                db,
                name="inspect_document_passage",
                arguments={"chunkId": str(selected_chunk), "radius": 1},
                context=context,
            )
            assert json.loads(inspected.content)["results"][0]["label"] == "S1"
            with pytest.raises(AgentToolError, match="not available"):
                await agent_tool_service.execute(
                    db,
                    name="inspect_document_passage",
                    arguments={"chunkId": str(other_chunk), "radius": 1},
                    context=context,
                )

    async def test_web_tools_are_same_run_allowlisted_and_bounded(
        self, db_session, monkeypatch
    ):
        monkeypatch.setattr(settings, "AGENT_MAX_WEB_SEARCHES", 1)
        monkeypatch.setattr(settings, "AGENT_MAX_WEB_INSPECTIONS", 1)
        context = _context()
        search = AsyncMock(
            return_value=[
                {
                    "url": "https://example.com/research",
                    "title": "Research",
                    "text": "A ranked result",
                    "score": 0.8,
                    "rank": 1,
                }
            ]
        )
        extract = AsyncMock(return_value="Longer extracted evidence")
        with patch("services.agent_tool_service.tavily_service.search", search), patch(
            "services.agent_tool_service.tavily_service.extract", extract
        ):
            result = await agent_tool_service.execute(
                db_session,
                name="search_web",
                arguments={"query": "research", "maxResults": 5, "timeRange": None},
                context=context,
            )
            assert json.loads(result.content)["results"][0]["label"] == "W1"
            inspected = await agent_tool_service.execute(
                db_session,
                name="inspect_web_source",
                arguments={"url": "https://example.com/research", "query": "detail"},
                context=context,
            )
            assert json.loads(inspected.content)["result"]["label"] == "W1"

            with pytest.raises(AgentToolError, match="limit"):
                await agent_tool_service.execute(
                    db_session,
                    name="search_web",
                    arguments={"query": "again", "maxResults": 1, "timeRange": None},
                    context=context,
                )
            with pytest.raises(AgentToolError, match="Only URLs"):
                await agent_tool_service.execute(
                    db_session,
                    name="inspect_web_source",
                    arguments={"url": "https://attacker.example", "query": None},
                    context=_context(),
                )


@pytest.mark.asyncio
class TestProviderToolAssembly:
    async def test_fragmented_streamed_tool_call_is_assembled(self):
        model = resolve_chat_model("gpt-oss-120b", False)
        assert model
        service = ProviderService()

        async def chunks():
            yield SimpleNamespace(
                usage=None,
                choices=[
                    SimpleNamespace(
                        delta=SimpleNamespace(
                            content=None,
                            tool_calls=[
                                SimpleNamespace(
                                    index=0,
                                    id="call_1",
                                    function=SimpleNamespace(
                                        name="calculate", arguments='{\"expression\":\"'
                                    ),
                                )
                            ],
                        )
                    )
                ],
            )
            yield SimpleNamespace(
                usage=SimpleNamespace(
                    prompt_tokens=10, completion_tokens=3, total_tokens=13
                ),
                choices=[
                    SimpleNamespace(
                        delta=SimpleNamespace(
                            content=None,
                            tool_calls=[
                                SimpleNamespace(
                                    index=0,
                                    id=None,
                                    function=SimpleNamespace(name=None, arguments='2+2\"}'),
                                )
                            ],
                        )
                    )
                ],
            )

        client = MagicMock()
        client.chat.completions.create = AsyncMock(return_value=chunks())
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "calculate",
                    "strict": True,
                    "parameters": {"type": "object", "additionalProperties": False},
                },
            }
        ]
        with patch.object(service, "_client", return_value=client):
            events = [
                event
                async for event in service._stream_once(
                    model, [], reasoning=False, tools=tools
                )
            ]
        assert events[0]["type"] == "tool_calls"
        call = events[0]["toolCalls"][0]
        assert call["id"] == "call_1"
        assert call["function"] == {
            "name": "calculate",
            "arguments": '{"expression":"2+2"}',
        }
        request = client.chat.completions.create.await_args.kwargs
        assert request["parallel_tool_calls"] is False
        assert request["tool_choice"] == "auto"


@pytest.mark.asyncio
class TestTavilyService:
    async def test_search_extract_and_bounded_failures(self, monkeypatch):
        service = TavilyService()
        monkeypatch.setattr(settings, "TAVILY_API_KEY", "test-key")
        monkeypatch.setattr(settings, "TAVILY_MAX_RESULTS", 3)
        service._post = AsyncMock(
            side_effect=[
                {
                    "results": [
                        {
                            "url": "https://example.com/a",
                            "title": "A",
                            "content": "Snippet",
                            "score": 0.7,
                            "published_date": "2026-07-15",
                        },
                        "not-an-object",
                        {"url": "javascript:alert(1)", "title": "bad"},
                    ]
                },
                {
                    "results": [
                        {
                            "url": "https://example.com/a",
                            "raw_content": "Extracted",
                        }
                    ]
                },
            ]
        )
        results = await service.search("query", max_results=6, time_range="week")
        assert len(results) == 1
        assert service._post.await_args_list[0].args[1]["max_results"] == 3
        extracted = await service.extract("https://example.com/a", query="focus")
        assert extracted == "Extracted"

        monkeypatch.setattr(settings, "TAVILY_API_KEY", "")
        with pytest.raises(TavilyUnavailable, match="not configured"):
            service._headers()

    @pytest.mark.parametrize(
        ("status", "message"),
        [(401, "credentials"), (429, "rate limit"), (503, "unavailable")],
    )
    async def test_http_errors_are_sanitized(self, monkeypatch, status, message):
        service = TavilyService()
        monkeypatch.setattr(settings, "TAVILY_API_KEY", "test-key")
        request = httpx.Request("POST", "https://api.tavily.com/search")
        response = httpx.Response(status, request=request)
        client = AsyncMock()
        client.__aenter__.return_value.post.side_effect = httpx.HTTPStatusError(
            "provider payload", request=request, response=response
        )
        with patch("services.tavily_service.httpx.AsyncClient", return_value=client):
            with pytest.raises(TavilyUnavailable, match=message):
                await service._post("/search", {"query": "x"})

    async def test_transport_and_response_failures_are_sanitized(self, monkeypatch):
        service = TavilyService()
        monkeypatch.setattr(settings, "TAVILY_API_KEY", "test-key")
        request = httpx.Request("POST", "https://api.tavily.com/search")

        response = MagicMock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"results": []}
        client = AsyncMock()
        client.__aenter__.return_value.post.return_value = response
        with patch("services.tavily_service.httpx.AsyncClient", return_value=client):
            assert await service._post("/search", {"query": "x"}) == {"results": []}

        response.json.side_effect = ValueError("invalid json")
        with patch("services.tavily_service.httpx.AsyncClient", return_value=client):
            with pytest.raises(TavilyUnavailable, match="invalid response"):
                await service._post("/search", {"query": "x"})

        client.__aenter__.return_value.post.side_effect = httpx.ConnectError(
            "offline", request=request
        )
        with patch("services.tavily_service.httpx.AsyncClient", return_value=client):
            with pytest.raises(TavilyUnavailable, match="timed out"):
                await service._post("/search", {"query": "x"})

        response_400 = httpx.Response(400, request=request)
        client.__aenter__.return_value.post.side_effect = httpx.HTTPStatusError(
            "bad request", request=request, response=response_400
        )
        with patch("services.tavily_service.httpx.AsyncClient", return_value=client):
            with pytest.raises(TavilyUnavailable, match="status 400"):
                await service._post("/search", {"query": "x"})

        service._post = AsyncMock(return_value={"results": []})
        with pytest.raises(TavilyUnavailable, match="could not be extracted"):
            await service.extract("https://example.com/missing")


@pytest.mark.asyncio
class TestAgentConversationAPI:
    async def test_agent_removes_uncollected_citation_markers(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(settings, "AGENT_TOOLS_ENABLED", True)
        conversation = await _create_conversation(client)

        async def stream(_model, _messages, **_kwargs):
            yield {"type": "delta", "text": "The calculated result is 25 [[W99]]."}

        with patch(
            "routers.conversations.provider_service.stream_chat", side_effect=stream
        ):
            response = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(uuid.uuid4()),
                    "content": "Calculate five squared",
                    "agentMode": True,
                },
            )

        assert response.status_code == 200
        completed = next(
            event for event in _events(response) if event["type"] == "message.completed"
        )
        assert "[[W99]]" not in completed["content"]

    async def test_invalid_retrieval_timestamp_is_not_persisted(self, client):
        conversation = await _create_conversation(client)
        conversation_id = uuid.UUID(conversation["id"])
        async with test_session_factory() as db:
            assistant = ConversationMessage(
                conversation_id=conversation_id,
                role="assistant",
                content="answer",
                status="complete",
            )
            db.add(assistant)
            await db.flush()
            citations = await _persist_citations(
                db,
                assistant.id,
                [
                    {
                        "sourceLabel": "W1",
                        "sourceOrder": 1,
                        "sourceType": "web",
                        "chunkId": None,
                        "fileId": None,
                        "fileName": None,
                        "excerpt": "evidence",
                        "pageStart": None,
                        "pageEnd": None,
                        "startTime": None,
                        "endTime": None,
                        "retrievalRank": 1,
                        "retrievalScore": 1.0,
                        "webUrl": "https://example.com",
                        "webTitle": "Example",
                        "webDomain": "example.com",
                        "retrievedAt": "not-a-timestamp",
                    }
                ],
            )
            await db.commit()
            assert citations[0].retrieved_at is None
            persisted = (
                await db.execute(
                    select(MessageCitation).where(
                        MessageCitation.message_id == assistant.id
                    )
                )
            ).scalar_one()
            assert persisted.source_type == "web"

    async def test_agent_turn_persists_trace_charges_once_and_replays(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(settings, "AGENT_TOOLS_ENABLED", True)
        conversation = await _create_conversation(client)
        request_id = uuid.uuid4()
        provider_calls = 0

        async def stream(_model, _messages, **kwargs):
            nonlocal provider_calls
            provider_calls += 1
            if provider_calls == 1:
                assert kwargs["tools"]
                yield {
                    "type": "tool_calls",
                    "toolCalls": [
                        {
                            "id": "calculate_1",
                            "type": "function",
                            "function": {
                                "name": "calculate",
                                "arguments": '{"expression":"21 * 2"}',
                            },
                        }
                    ],
                    "provider": "cerebras",
                    "modelId": "gpt-oss-120b",
                    "fallbackUsed": False,
                    "originalProvider": "cerebras",
                }
                yield {
                    "type": "usage",
                    "promptTokens": 20,
                    "completionTokens": 4,
                    "totalTokens": 24,
                    "provider": "cerebras",
                    "modelId": "gpt-oss-120b",
                    "fallbackUsed": False,
                    "originalProvider": "cerebras",
                }
            else:
                yield {
                    "type": "delta",
                    "text": "The result is 42.",
                    "provider": "cerebras",
                    "modelId": "gpt-oss-120b",
                    "fallbackUsed": False,
                    "originalProvider": "cerebras",
                }
                yield {
                    "type": "usage",
                    "promptTokens": 31,
                    "completionTokens": 7,
                    "totalTokens": 38,
                    "provider": "cerebras",
                    "modelId": "gpt-oss-120b",
                    "fallbackUsed": False,
                    "originalProvider": "cerebras",
                }

        payload = {
            "requestId": str(request_id),
            "content": "Calculate 21 times 2",
            "modelId": "gpt-oss-120b",
            "reasoning": False,
            "agentMode": True,
        }
        with patch(
            "routers.conversations.provider_service.stream_chat", side_effect=stream
        ):
            first = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages", json=payload
            )
            second = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages", json=payload
            )

        assert first.status_code == second.status_code == 200
        event_types = [event["type"] for event in _events(first)]
        assert event_types == [
            "message.started",
            "agent.started",
            "tool.started",
            "tool.completed",
            "response.delta",
            "usage",
            "message.completed",
        ]
        assert provider_calls == 2

        history = await client.get(
            f"/api/chat/conversations/{conversation['id']}/messages"
        )
        assistant = history.json()["items"][-1]
        assert assistant["agentMode"] is True
        assert assistant["agentIterations"] == 2
        assert assistant["toolCallCount"] == 1
        assert assistant["toolInvocations"][0]["resultSummary"]["result"] == 42

        async with test_session_factory() as db:
            tool_count = int(
                (await db.execute(select(func.count()).select_from(ToolInvocation))).scalar()
                or 0
            )
            ledger = (
                await db.execute(
                    select(UsageLedger).where(UsageLedger.request_id == request_id)
                )
            ).scalar_one()
        assert tool_count == 1
        assert ledger.reserved_units == 3
        assert ledger.settled_units == 3

    async def test_agent_document_and_web_evidence_are_verified(
        self, client, create_owned_file, monkeypatch
    ):
        monkeypatch.setattr(settings, "AGENT_TOOLS_ENABLED", True)
        monkeypatch.setattr(settings, "TAVILY_API_KEY", "test-key")
        file_id = await create_owned_file(file_name="paper.pdf")
        chunk_id = uuid.uuid4()
        conversation = await _create_conversation(client, [file_id])
        document_source = {
            "id": str(chunk_id),
            "file_id": file_id,
            "text": "The paper uses attention.",
            "page_start": 4,
            "page_end": 4,
            "start_time": None,
            "end_time": None,
            "score": 0.9,
            "rank": 1,
            "ordinal": 0,
        }
        provider_calls = 0

        async def stream(_model, _messages, **_kwargs):
            nonlocal provider_calls
            provider_calls += 1
            if provider_calls == 1:
                calls = [
                    {
                        "id": "doc_1",
                        "type": "function",
                        "function": {
                            "name": "search_selected_documents",
                            "arguments": '{"query":"attention","limit":4}',
                        },
                    }
                ]
                yield {"type": "tool_calls", "toolCalls": calls}
                yield {"type": "usage", "promptTokens": 10, "completionTokens": 3}
            elif provider_calls == 2:
                calls = [
                    {
                        "id": "web_1",
                        "type": "function",
                        "function": {
                            "name": "search_web",
                            "arguments": '{"query":"attention research","maxResults":3}',
                        },
                    }
                ]
                yield {"type": "tool_calls", "toolCalls": calls}
                yield {"type": "usage", "promptTokens": 14, "completionTokens": 3}
            else:
                yield {
                    "type": "delta",
                    "text": "The paper uses attention [[S1]], with related public research [[W1]].",
                }
                yield {"type": "usage", "promptTokens": 22, "completionTokens": 9}

        web_results = [
            {
                "url": "https://example.com/attention",
                "title": "Attention research",
                "text": "Public research snippet",
                "score": 0.8,
                "rank": 1,
            }
        ]
        retrieval = AsyncMock(return_value=[document_source])
        with patch(
            "routers.conversations.provider_service.stream_chat", side_effect=stream
        ), patch(
            "services.agent_tool_service.document_index_service.search", retrieval
        ), patch(
            "services.agent_tool_service.tavily_service.search",
            new=AsyncMock(return_value=web_results),
        ):
            response = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(uuid.uuid4()),
                    "content": "Research attention",
                    "agentMode": True,
                },
            )
        assert response.status_code == 200, response.text
        assert retrieval.await_count == 1
        assert retrieval.await_args.kwargs["query"] == "attention"
        citations = [
            event["citation"]
            for event in _events(response)
            if event["type"] == "citation"
        ]
        assert [citation["sourceType"] for citation in citations] == [
            "document",
            "web",
        ]
        assert citations[1]["webUrl"] == "https://example.com/attention"

    async def test_disabled_active_and_failure_paths_refund(self, client, monkeypatch):
        conversation = await _create_conversation(client)
        disabled = await client.post(
            f"/api/chat/conversations/{conversation['id']}/messages",
            json={
                "requestId": str(uuid.uuid4()),
                "content": "Research",
                "agentMode": True,
            },
        )
        assert disabled.status_code == 503

        monkeypatch.setattr(settings, "AGENT_TOOLS_ENABLED", True)
        conversation_id = uuid.UUID(conversation["id"])
        async with test_session_factory() as db:
            db.add(
                ConversationMessage(
                    conversation_id=conversation_id,
                    role="assistant",
                    content="",
                    status="streaming",
                    agent_mode=True,
                )
            )
            await db.commit()
        active = await client.post(
            f"/api/chat/conversations/{conversation['id']}/messages",
            json={
                "requestId": str(uuid.uuid4()),
                "content": "Another run",
                "agentMode": True,
            },
        )
        assert active.status_code == 409

        async with test_session_factory() as db:
            running = (
                await db.execute(
                    select(ConversationMessage).where(
                        ConversationMessage.conversation_id == conversation_id,
                        ConversationMessage.status == "streaming",
                    )
                )
            ).scalar_one()
            running.status = "failed"
            await db.commit()

        request_id = uuid.uuid4()

        async def unavailable(*_args, **_kwargs):
            if False:
                yield {}
            raise ProviderUnavailable("offline")

        with patch(
            "routers.conversations.provider_service.stream_chat",
            side_effect=unavailable,
        ):
            failed = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(request_id),
                    "content": "Fail safely",
                    "modelId": "gpt-oss-120b",
                    "agentMode": True,
                    "reasoning": True,
                },
            )
        failure = next(
            event for event in _events(failed) if event["type"] == "message.failed"
        )
        assert failure["error"]["retryable"] is True
        async with test_session_factory() as db:
            ledger = (
                await db.execute(
                    select(UsageLedger).where(UsageLedger.request_id == request_id)
                )
            ).scalar_one()
        assert ledger.reserved_units == 6
        assert ledger.refunded_units == 6
        assert ledger.status == "refunded"

    async def test_tool_failures_are_traced_and_fallback_is_disclosed(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(settings, "AGENT_TOOLS_ENABLED", True)
        monkeypatch.setattr(settings, "AGENT_TOOL_TIMEOUT_SECONDS", 0.001)
        conversation = await _create_conversation(client)
        provider_calls = 0

        async def stream(_model, _messages, **_kwargs):
            nonlocal provider_calls
            provider_calls += 1
            if provider_calls == 1:
                yield {
                    "type": "tool_calls",
                    "toolCalls": [
                        {
                            "id": "invalid_1",
                            "function": {
                                "name": "calculate",
                                "arguments": "not-json",
                            },
                        },
                        {
                            "id": "timeout_1",
                            "function": {
                                "name": "calculate",
                                "arguments": '{"expression":"2+2"}',
                            },
                        },
                        {
                            "id": "failure_1",
                            "function": {
                                "name": "get_datetime",
                                "arguments": '{"timezone":"UTC"}',
                            },
                        },
                    ],
                }
            else:
                yield {
                    "type": "delta",
                    "text": "The bounded tools could not complete.",
                    "provider": "openrouter",
                    "modelId": "tencent/hy3",
                    "fallbackUsed": True,
                    "originalProvider": "cerebras",
                }

        async def execute(_db, *, name, **_kwargs):
            if name == "calculate":
                await asyncio.sleep(0.05)
            raise RuntimeError("private provider payload")

        with patch(
            "routers.conversations.provider_service.stream_chat", side_effect=stream
        ), patch(
            "routers.conversations.agent_tool_service.execute", side_effect=execute
        ):
            response = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(uuid.uuid4()),
                    "content": "Exercise bounded failures",
                    "agentMode": True,
                },
            )

        assert response.status_code == 200
        events = _events(response)
        failed_tools = [
            event["toolInvocation"]
            for event in events
            if event["type"] == "tool.failed"
        ]
        assert [item["error"]["code"] for item in failed_tools] == [
            "invalid_arguments",
            "tool_timeout",
            "tool_failed",
        ]
        completed = next(event for event in events if event["type"] == "message.completed")
        assert completed["fallbackUsed"] is True
        assert completed["provider"] == "openrouter"

    async def test_tool_call_limit_returns_a_bounded_final_answer(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(settings, "AGENT_TOOLS_ENABLED", True)
        monkeypatch.setattr(settings, "AGENT_MAX_TOOL_CALLS", 1)
        conversation = await _create_conversation(client)
        provider_calls = 0

        async def stream(_model, messages, **kwargs):
            nonlocal provider_calls
            provider_calls += 1
            if provider_calls == 1:
                assert kwargs["tools"]
                yield {
                    "type": "tool_calls",
                    "toolCalls": [
                        {
                            "id": "first_1",
                            "function": {
                                "name": "calculate",
                                "arguments": '{"expression":"3*3"}',
                            },
                        },
                        {
                            "id": "",
                            "function": {
                                "name": "calculate",
                                "arguments": '{"expression":"4*4"}',
                            },
                        },
                    ],
                }
            else:
                assert kwargs["tools"] is None
                assert "tool_call_limit" in messages[-1]["content"]
                yield {"type": "delta", "text": "The first result is 9."}

        with patch(
            "routers.conversations.provider_service.stream_chat", side_effect=stream
        ):
            response = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(uuid.uuid4()),
                    "content": "Respect the tool limit",
                    "agentMode": True,
                },
            )
        assert response.status_code == 200
        completed = next(
            event for event in _events(response) if event["type"] == "message.completed"
        )
        assert completed["content"] == "The first result is 9."
        assert completed["toolCallCount"] == 1

    async def test_repeated_provider_call_id_executes_once(self, client, monkeypatch):
        monkeypatch.setattr(settings, "AGENT_TOOLS_ENABLED", True)
        conversation = await _create_conversation(client)
        provider_calls = 0

        async def stream(_model, messages, **_kwargs):
            nonlocal provider_calls
            provider_calls += 1
            if provider_calls <= 2:
                yield {
                    "type": "tool_calls",
                    "toolCalls": [
                        {
                            "id": "same_call_id",
                            "function": {
                                "name": "calculate",
                                "arguments": '{"expression":"5*5"}',
                            },
                        }
                    ],
                }
            else:
                assert '"replayed":true' in messages[-1]["content"]

        with patch(
            "routers.conversations.provider_service.stream_chat", side_effect=stream
        ):
            response = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(uuid.uuid4()),
                    "content": "Do not execute duplicate calls",
                    "agentMode": True,
                },
            )
        assert response.status_code == 200
        events = _events(response)
        assert sum(event["type"] == "tool.started" for event in events) == 1
        completed = next(event for event in events if event["type"] == "message.completed")
        assert completed["content"].startswith("I reached the bounded research limit")
        async with test_session_factory() as db:
            invocation_count = int(
                (
                    await db.execute(
                        select(func.count()).select_from(ToolInvocation)
                    )
                ).scalar()
                or 0
            )
        assert invocation_count == 1

    async def test_missing_citations_are_repaired_once(self, client, monkeypatch):
        monkeypatch.setattr(settings, "AGENT_TOOLS_ENABLED", True)
        monkeypatch.setattr(settings, "TAVILY_API_KEY", "test-key")
        conversation = await _create_conversation(client)
        provider_calls = 0

        async def stream(_model, _messages, **_kwargs):
            nonlocal provider_calls
            provider_calls += 1
            if provider_calls == 1:
                yield {
                    "type": "tool_calls",
                    "toolCalls": [
                        {
                            "id": "web_repair_1",
                            "function": {
                                "name": "search_web",
                                "arguments": '{"query":"verified source","maxResults":1}',
                            },
                        }
                    ],
                }
            else:
                yield {"type": "delta", "text": "An uncited factual answer."}

        repair = AsyncMock(
            return_value=(
                "A verified factual answer [[W1]].",
                {
                    "promptTokens": 8,
                    "completionTokens": 4,
                    "totalTokens": 12,
                    "fallbackUsed": True,
                },
            )
        )
        with patch(
            "routers.conversations.provider_service.stream_chat", side_effect=stream
        ), patch(
            "services.agent_tool_service.tavily_service.search",
            new=AsyncMock(
                return_value=[
                    {
                        "url": "https://example.com/verified",
                        "title": "Verified",
                        "text": "Evidence",
                        "score": 1.0,
                        "rank": 1,
                    }
                ]
            ),
        ), patch("routers.conversations._repair_citations", repair):
            response = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(uuid.uuid4()),
                    "content": "Answer with a source",
                    "agentMode": True,
                },
            )
        assert response.status_code == 200
        assert repair.await_count == 1
        events = _events(response)
        citation = next(event["citation"] for event in events if event["type"] == "citation")
        assert citation["sourceLabel"] == "W1"
        completed = next(event for event in events if event["type"] == "message.completed")
        assert completed["content"] == "A verified factual answer [[W1]]."
        assert completed["fallbackUsed"] is True
