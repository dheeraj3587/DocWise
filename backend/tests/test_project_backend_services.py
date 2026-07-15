"""Fault-injection coverage for the project-grade backend services."""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from core.config import settings
from models.conversation import (
    Conversation,
    ConversationMessage,
    DailyUsage,
    DocumentChunk,
    OutboxEvent,
    ProcessingJob,
    UsageLedger,
)
from models.file import File
from services.document_index_service import (
    DocumentIndexService,
    _chunk_id,
    _content_hash,
    _cosine_similarity,
)
from services.conversation_context_service import ConversationContextService
from services.model_registry import fallback_chat_model, resolve_chat_model
from services.provider_service import ProviderService, ProviderUnavailable
from services.stream_event_service import StreamEventService
from services.usage_service import UsageService
from tests.conftest import MOCK_USER, test_session_factory as session_factory


async def _collect(stream):
    return [event async for event in stream]


@pytest.mark.asyncio
class TestProviderService:
    def test_request_shapes_retry_classification_and_clients(self, monkeypatch):
        service = ProviderService()
        openrouter = resolve_chat_model("tencent/hy3:free", True)
        cerebras = resolve_chat_model("gpt-oss-120b", True)
        assert openrouter and cerebras

        request = service._request(openrouter, [{"role": "user", "content": "x"}], reasoning=True, stream=True)
        assert request["extra_body"]["reasoning"]["enabled"] is True
        assert request["stream_options"]["include_usage"] is True
        cerebras_request = service._request(cerebras, [], reasoning=True, stream=False)
        assert cerebras_request["reasoning_effort"] == settings.CEREBRAS_DEEP_REASONING_EFFORT
        assert service._is_transient(httpx.ReadTimeout("slow")) is True
        assert service._is_transient(ValueError("bad")) is False
        rate_limited = RuntimeError("limited")
        rate_limited.status_code = 429
        server_error = RuntimeError("down")
        server_error.status_code = 503
        assert service._is_transient(rate_limited) is True
        assert service._is_transient(server_error) is True
        retry_response = SimpleNamespace(headers={"retry-after": "2"})
        retry_error = RuntimeError("retry")
        retry_error.response = retry_response
        assert service._retry_delay(retry_error, 0) == 2.0
        invalid_retry = RuntimeError("retry")
        invalid_retry.response = SimpleNamespace(headers={"retry-after": "later"})
        with patch("services.provider_service.random.uniform", return_value=0.1):
            assert service._retry_delay(invalid_retry, 0) == 1.1

        client = MagicMock()
        monkeypatch.setattr(settings, "OPENROUTER_HTTP_REFERER", "https://app.example.com")
        with patch("services.provider_service.AsyncOpenAI", return_value=client) as constructor:
            assert service._client("openrouter") is client
            assert service._client("openrouter") is client
            assert constructor.call_count == 1

        missing = ProviderService()
        monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "")
        with pytest.raises(ProviderUnavailable, match="OpenRouter is not configured"):
            missing._client("openrouter")
        monkeypatch.setattr(settings, "CEREBRAS_API_KEY", "")
        with pytest.raises(ProviderUnavailable, match="Cerebras is not configured"):
            missing._client("cerebras")
        monkeypatch.setattr(settings, "CEREBRAS_API_KEY", "configured")
        with patch("services.provider_service.AsyncOpenAI", return_value=client):
            assert ProviderService()._client("cerebras") is client
        with pytest.raises(ProviderUnavailable):
            service._client("unsupported")

    async def test_stream_once_and_circuit_state(self, monkeypatch):
        model = resolve_chat_model("gpt-oss-120b", False)
        assert model
        service = ProviderService()

        async def chunks():
            yield SimpleNamespace(
                usage=SimpleNamespace(
                    prompt_tokens=5,
                    completion_tokens=2,
                    total_tokens=7,
                ),
                choices=[SimpleNamespace(delta=SimpleNamespace(content="hello"))],
            )
            yield SimpleNamespace(usage=None, choices=[])

        client = MagicMock()
        client.chat.completions.create = AsyncMock(return_value=chunks())
        with patch.object(service, "_client", return_value=client):
            events = await _collect(service._stream_once(model, [], reasoning=False))
        assert events == [
            {"type": "delta", "text": "hello"},
            {"type": "usage", "promptTokens": 5, "completionTokens": 2, "totalTokens": 7},
        ]

        monkeypatch.setattr(settings, "CHAT_CIRCUIT_FAILURE_THRESHOLD", 2)
        await service._record_failure("cerebras")
        await service._record_failure("cerebras")
        assert await service._circuit_available("cerebras") is False
        await service._record_success("cerebras")
        assert await service._circuit_available("cerebras") is True

    async def test_stream_success_retry_fallback_and_partial_failure(self, monkeypatch):
        model = resolve_chat_model("gpt-oss-120b", False)
        assert model
        service = ProviderService()
        monkeypatch.setattr(settings, "CHAT_PROVIDER_MAX_RETRIES", 1)
        monkeypatch.setattr("services.provider_service.asyncio.sleep", AsyncMock())

        calls = 0

        def flaky(candidate, _messages, *, reasoning):
            async def events():
                nonlocal calls
                calls += 1
                if calls == 1:
                    raise httpx.ReadTimeout("retry")
                yield {"type": "delta", "text": "ok"}
                yield {"type": "usage", "totalTokens": 1}

            return events()

        with patch.object(service, "_stream_once", new=flaky):
            events = await _collect(service.stream_chat(model, [], reasoning=False))
        assert calls == 2
        assert events[0]["text"] == "ok"
        assert events[0]["fallbackUsed"] is False

        service = ProviderService()

        def fallback_stream(candidate, _messages, *, reasoning):
            async def events():
                if candidate["id"] == model["id"]:
                    raise httpx.ReadTimeout("primary down")
                yield {"type": "delta", "text": "fallback"}
                yield {"type": "usage", "totalTokens": 1}

            return events()

        monkeypatch.setattr(settings, "CHAT_PROVIDER_MAX_RETRIES", 0)
        with patch.object(service, "_stream_once", new=fallback_stream):
            events = await _collect(service.stream_chat(model, [], reasoning=False))
        assert events[0]["fallbackUsed"] is True
        assert events[0]["provider"] == "openrouter"

        service = ProviderService()

        def partial(_candidate, _messages, *, reasoning):
            async def events():
                yield {"type": "delta", "text": "partial"}
                raise httpx.ReadTimeout("lost")

            return events()

        with patch.object(service, "_stream_once", new=partial):
            with pytest.raises(ProviderUnavailable, match="interrupted"):
                await _collect(service.stream_chat(model, [], reasoning=False))

    async def test_complete_retries_and_falls_back(self, monkeypatch):
        model = resolve_chat_model("gpt-oss-120b", False)
        assert model
        service = ProviderService()
        monkeypatch.setattr(settings, "CHAT_PROVIDER_MAX_RETRIES", 0)

        async def create(**request):
            if request["model"] == model["model"]:
                raise httpx.ReadTimeout("primary")
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="fallback answer"))],
                usage=SimpleNamespace(prompt_tokens=4, completion_tokens=2, total_tokens=6),
            )

        fake_client = MagicMock()
        fake_client.chat.completions.create = AsyncMock(side_effect=create)
        with patch.object(service, "_client", return_value=fake_client):
            answer, metadata = await service.complete(model, [], reasoning=False)
        assert answer == "fallback answer"
        assert metadata["fallbackUsed"] is True
        assert metadata["totalTokens"] == 6

        service = ProviderService()
        with patch.object(service, "_circuit_available", new=AsyncMock(return_value=False)):
            with pytest.raises(ProviderUnavailable):
                await service.complete(model, [], reasoning=False)

        retrying = ProviderService()
        monkeypatch.setattr(settings, "CHAT_PROVIDER_MAX_RETRIES", 1)
        monkeypatch.setattr("services.provider_service.asyncio.sleep", AsyncMock())
        response = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="second try"))],
            usage=None,
        )
        retry_client = MagicMock()
        retry_client.chat.completions.create = AsyncMock(
            side_effect=[httpx.ReadTimeout("first"), response]
        )
        with patch.object(retrying, "_client", return_value=retry_client):
            answer, metadata = await retrying.complete(model, [], reasoning=False)
        assert answer == "second try"
        assert metadata["totalTokens"] == 0

        unavailable = ProviderService()
        with patch.object(unavailable, "_circuit_available", new=AsyncMock(return_value=False)):
            with pytest.raises(ProviderUnavailable, match="All compatible"):
                await _collect(unavailable.stream_chat(model, [], reasoning=False))


@pytest.mark.asyncio
class TestDocumentIndexService:
    async def test_replace_search_and_empty_replacement(self, create_owned_file):
        file_id = await create_owned_file()
        service = DocumentIndexService()
        chunks = [
            {"ordinal": 0, "text": "alpha transformer attention", "page_start": 1, "page_end": 1},
            {"ordinal": 1, "text": "beta retrieval context", "page_start": 2, "page_end": 2},
        ]
        with patch(
            "services.document_index_service.embedding_service.embed_texts",
            return_value=[[1.0] + [0.0] * 383, [0.0, 1.0] + [0.0] * 382],
        ):
            async with session_factory() as db:
                file_record = (
                    await db.execute(select(File).where(File.file_id == uuid.UUID(file_id)))
                ).scalar_one()
                count = await service.replace_chunks(db, file_record, chunks)
                await db.commit()
        assert count == 2

        with patch(
            "services.document_index_service.embedding_service.embed_query",
            return_value=[1.0] + [0.0] * 383,
        ):
            async with session_factory() as db:
                results = await service.search(
                    db,
                    owner_sub=MOCK_USER["sub"],
                    file_ids=[uuid.UUID(file_id)],
                    query="alpha attention",
                )
        assert results[0]["page_start"] == 1
        assert results[0]["rank"] == 1

        async with session_factory() as db:
            file_record = (
                await db.execute(select(File).where(File.file_id == uuid.UUID(file_id)))
            ).scalar_one()
            assert await service.replace_chunks(db, file_record, [{"text": "  "}]) == 0
            await db.commit()
            remaining = int(
                (
                    await db.execute(
                        select(func.count()).select_from(DocumentChunk).where(
                            DocumentChunk.file_id == uuid.UUID(file_id)
                        )
                    )
                ).scalar()
                or 0
            )
        assert remaining == 0

    async def test_index_helpers_and_diversification(self):
        digest = _content_hash("hello")
        file_id = uuid.uuid4()
        assert _chunk_id(file_id, "v1", 0, digest) == _chunk_id(file_id, "v1", 0, digest)
        assert _cosine_similarity([1.0, 0.0], [1.0, 0.0]) == 1.0
        assert _cosine_similarity([], []) == 0.0
        assert await DocumentIndexService().search(
            MagicMock(), owner_sub="u", file_ids=[], query="x"
        ) == []

        ranked = [
            {"file_id": "a", "score": 3},
            {"file_id": "a", "score": 2},
            {"file_id": "a", "score": 1},
            {"file_id": "b", "score": 1},
        ]
        selected = DocumentIndexService._diversify(ranked, 3)
        assert {item["file_id"] for item in selected} == {"a", "b"}
        assert [item["rank"] for item in selected] == [1, 2, 3]


@pytest.mark.asyncio
class TestContextAndModelMetadata:
    async def test_context_budget_truncates_summary_sources_and_history(self):
        conversation_id = uuid.uuid4()
        current_message_id = uuid.uuid4()
        model = resolve_chat_model("gpt-oss-120b", False)
        assert model
        constrained_model = {
            **model,
            "contextWindow": 5000,
            "outputReserveTokens": 100,
        }
        async with session_factory() as db:
            conversation = Conversation(
                id=conversation_id,
                owner_sub=MOCK_USER["sub"],
                title="Context",
                mode="document",
                summary="summary " * 1000,
            )
            db.add(conversation)
            now = datetime.utcnow()
            db.add_all(
                [
                    ConversationMessage(
                        conversation_id=conversation_id,
                        role="user",
                        content="old " * 5000,
                        status="complete",
                        created_at=now,
                    ),
                    ConversationMessage(
                        conversation_id=conversation_id,
                        role="assistant",
                        content="short remembered answer",
                        status="complete",
                        created_at=now + timedelta(seconds=1),
                    ),
                    ConversationMessage(
                        conversation_id=conversation_id,
                        role="user",
                        content="new " * 5000,
                        status="complete",
                        created_at=now + timedelta(seconds=2),
                    ),
                ]
            )
            await db.commit()
            built = await ConversationContextService().build(
                db,
                conversation=conversation,
                current_user_message_id=current_message_id,
                current_question="What is grounded?",
                model=constrained_model,
                reasoning=True,
                sources=[
                    {
                        "label": "S1",
                        "file_name": "one.pdf",
                        "text": "evidence " * 3000,
                        "page_start": 1,
                        "page_end": 1,
                    },
                    {
                        "label": "S2",
                        "file_name": "two.pdf",
                        "text": "second " * 3000,
                        "page_start": 2,
                        "page_end": 2,
                    },
                ],
            )

        assert len(built.sources) == 1
        assert len(built.sources[0]["text"]) < 12000
        assert built.context_used <= built.context_window
        assert any("Conversation summary" in message["content"] for message in built.messages)

    async def test_model_fallback_configuration_edges(self, monkeypatch):
        model = resolve_chat_model("tencent/hy3:free", True)
        assert model and model["reasoning"] is True
        no_fallback = {**model, "fallbackModelId": None}
        assert fallback_chat_model(no_fallback, False) is None
        unknown = {**model, "fallbackModelId": "unknown"}
        assert fallback_chat_model(unknown, False) is None

        cerebras = resolve_chat_model("gpt-oss-120b", False)
        assert cerebras
        monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "")
        assert fallback_chat_model(cerebras, False) is None
        monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "configured")
        monkeypatch.setattr(settings, "CEREBRAS_API_KEY", "")
        assert fallback_chat_model(model, False) is None

        custom = {
            **model,
            "id": "custom-openrouter",
            "model": "custom-openrouter",
            "reasoning_effort": None,
        }
        with patch("services.model_registry.available_chat_models", return_value=[custom]):
            resolved = resolve_chat_model("custom-openrouter", True)
        assert resolved and resolved["reasoning_effort"] == "medium"


@pytest.mark.asyncio
class TestUsageAndReplayServices:
    async def test_usage_reserve_settle_duplicate_refund_and_limit(self, monkeypatch):
        service = UsageService()
        conversation_id = uuid.uuid4()
        message_id = uuid.uuid4()
        request_id = uuid.uuid4()
        async with session_factory() as db:
            db.add(Conversation(id=conversation_id, owner_sub=MOCK_USER["sub"], title="Usage"))
            db.add(
                ConversationMessage(
                    id=message_id,
                    conversation_id=conversation_id,
                    role="assistant",
                    content="",
                )
            )
            await db.flush()
            first = await service.reserve(
                db,
                owner_sub=MOCK_USER["sub"],
                request_id=request_id,
                units=4,
                conversation_id=conversation_id,
                message_id=message_id,
                provider="cerebras",
                model_id="gpt-oss-120b",
            )
            duplicate = await service.reserve(
                db,
                owner_sub=MOCK_USER["sub"],
                request_id=request_id,
                units=4,
                conversation_id=conversation_id,
                message_id=message_id,
                provider="cerebras",
                model_id="gpt-oss-120b",
            )
            assert duplicate.id == first.id
            assert await service.daily_units(db, MOCK_USER["sub"]) == 4
            await service.settle(
                db,
                request_id=request_id,
                owner_sub=MOCK_USER["sub"],
                provider="openrouter",
                model_id="tencent/hy3:free",
                metadata={"totalTokens": 9},
            )
            await service.refund(db, request_id=request_id, owner_sub=MOCK_USER["sub"])
            await db.commit()
            ledger = (
                await db.execute(select(UsageLedger).where(UsageLedger.id == first.id))
            ).scalar_one()
            daily = (
                await db.execute(select(DailyUsage).where(DailyUsage.owner_sub == MOCK_USER["sub"]))
            ).scalar_one()
        assert ledger.status == "refunded"
        assert ledger.refunded_units == 4
        assert daily.used_units == 0

        monkeypatch.setattr(settings, "LLM_DAILY_BUDGET_UNITS_PER_USER", 1)
        async with session_factory() as db:
            with pytest.raises(HTTPException) as exc:
                await service.reserve(
                    db,
                    owner_sub=MOCK_USER["sub"],
                    request_id=uuid.uuid4(),
                    units=2,
                    conversation_id=conversation_id,
                    message_id=message_id,
                    provider="cerebras",
                    model_id="gpt-oss-120b",
                )
            assert exc.value.status_code == 429

    async def test_stream_events_redis_and_memory_fallback(self):
        service = StreamEventService()
        redis = AsyncMock()
        redis.lrange.return_value = ['{"id":2,"type":"response.delta"}']
        with patch.object(service, "_get_redis", new=AsyncMock(return_value=redis)):
            await service.append("m1", {"id": 1, "type": "message.started"})
            events = await service.after("m1", 1)
        redis.rpush.assert_awaited_once()
        assert events[0]["id"] == 2

        service = StreamEventService()
        with patch.object(service, "_get_redis", new=AsyncMock(return_value=None)):
            await service.append("m2", {"id": 1, "type": "message.started"})
            await service.append("m2", {"id": 2, "type": "message.completed"})
            events = await service.after("m2", 1)
        assert [event["id"] for event in events] == [2]
        key = "chat:events:m2"
        service._memory[key] = (time.time() - 1, service._memory[key][1])
        with patch.object(service, "_get_redis", new=AsyncMock(return_value=None)):
            assert await service.after("m2", 0) == []

        service = StreamEventService()
        connected = AsyncMock()
        connected.ping.return_value = True
        with patch("services.stream_event_service.Redis.from_url", return_value=connected):
            assert await service._get_redis() is connected
            assert await service._get_redis() is connected

        connected.rpush.side_effect = OSError("write failed")
        await service.append("m3", {"id": 1, "type": "response.delta"})
        service._redis = connected
        connected.lrange.side_effect = OSError("read failed")
        assert await service.after("m3", 0) == [
            {"id": 1, "type": "response.delta"}
        ]


@pytest.mark.asyncio
class TestDurableWorkerRecovery:
    async def test_outbox_dispatch_stale_recovery_and_summary(self, create_owned_file):
        from tasks.celery_worker import (
            _dispatch_outbox_async,
            _recover_stale_jobs_async,
            _summarize_conversation_async,
        )

        file_id = await create_owned_file()
        async with session_factory() as db:
            job = ProcessingJob(
                file_id=uuid.UUID(file_id),
                kind="process_pdf",
                version="v1",
                status="running",
                heartbeat_at=datetime.utcnow() - timedelta(hours=1),
                attempts=1,
            )
            db.add(job)
            await db.flush()
            db.add(
                OutboxEvent(
                    event_type="file.process",
                    aggregate_id=file_id,
                    payload={
                        "fileId": file_id,
                        "storageKey": "pdf/key.pdf",
                        "fileName": "test.pdf",
                        "fileType": "pdf",
                        "jobId": str(job.id),
                    },
                )
            )
            await db.commit()

        with patch("tasks.celery_worker.process_pdf.delay") as dispatch:
            result = await _dispatch_outbox_async()
        assert result["dispatched"] == 1
        dispatch.assert_called_once()

        recovered = await _recover_stale_jobs_async()
        assert recovered["recovered"] == 1
        async with session_factory() as db:
            job = (
                await db.execute(select(ProcessingJob).where(ProcessingJob.file_id == uuid.UUID(file_id)))
            ).scalar_one()
            assert job.status == "queued"
            assert int(
                (
                    await db.execute(
                        select(func.count()).select_from(OutboxEvent).where(
                            OutboxEvent.status == "pending"
                        )
                    )
                ).scalar()
                or 0
            ) == 1

        conversation_id = uuid.uuid4()
        user_message_id = uuid.uuid4()
        assistant_message_id = uuid.uuid4()
        async with session_factory() as db:
            db.add(
                Conversation(
                    id=conversation_id,
                    owner_sub=MOCK_USER["sub"],
                    title="Summary",
                    selected_model_id="gpt-oss-120b",
                )
            )
            db.add_all(
                [
                    ConversationMessage(
                        id=user_message_id,
                        conversation_id=conversation_id,
                        role="user",
                        content="Remember alpha",
                        status="complete",
                        completed_at=datetime.utcnow(),
                    ),
                    ConversationMessage(
                        id=assistant_message_id,
                        conversation_id=conversation_id,
                        parent_message_id=user_message_id,
                        role="assistant",
                        content="Alpha remembered",
                        status="complete",
                        completed_at=datetime.utcnow(),
                    ),
                ]
            )
            await db.commit()

        with patch(
            "services.provider_service.provider_service.complete",
            new=AsyncMock(return_value=("Compact memory", {})),
        ):
            summary_result = await _summarize_conversation_async(
                str(conversation_id), str(assistant_message_id)
            )
            skipped = await _summarize_conversation_async(
                str(conversation_id), str(assistant_message_id)
            )
        assert summary_result["status"] == "updated"
        assert skipped["status"] == "skipped"
