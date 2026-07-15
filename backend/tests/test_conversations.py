"""Contract tests for durable conversations, context, citations, and credits."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import func, select

from core.security import get_current_user
from models.conversation import (
    Conversation,
    ConversationDocument,
    ConversationMessage,
    DocumentChunk,
    MessageCitation,
    OutboxEvent,
    UsageLedger,
)
from routers.conversations import (
    _owner_sub,
    _queue_summary_if_due,
    _repair_citations,
    _resolve_model,
)
from services.model_registry import resolve_chat_model
from services.provider_service import ProviderUnavailable
from tests.conftest import MOCK_USER, test_session_factory


def _events(response) -> list[dict]:
    events: list[dict] = []
    for block in response.text.split("\n\n"):
        data = next(
            (line.removeprefix("data: ") for line in block.splitlines() if line.startswith("data: ")),
            None,
        )
        if data:
            events.append(json.loads(data))
    return events


def _provider_stream(answer: str, *, prompt_tokens: int = 25, completion_tokens: int = 8):
    async def stream(*_args, **_kwargs):
        yield {
            "type": "delta",
            "text": answer,
            "provider": "cerebras",
            "modelId": "gpt-oss-120b",
            "fallbackUsed": False,
            "originalProvider": "cerebras",
        }
        yield {
            "type": "usage",
            "promptTokens": prompt_tokens,
            "completionTokens": completion_tokens,
            "totalTokens": prompt_tokens + completion_tokens,
            "provider": "cerebras",
            "modelId": "gpt-oss-120b",
            "fallbackUsed": False,
            "originalProvider": "cerebras",
        }

    return stream


async def _create_conversation(client, *, document_ids=None):
    document_ids = document_ids or []
    response = await client.post(
        "/api/chat/conversations",
        json={
            "title": "Research thread",
            "mode": "document" if document_ids else "general",
            "documentIds": document_ids,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
class TestConversationAccess:
    async def test_named_conversation_crud_and_cross_user_403(self, client):
        conversation = await _create_conversation(client)

        renamed = await client.patch(
            f"/api/chat/conversations/{conversation['id']}",
            json={"title": "Renamed", "status": "archived"},
        )
        assert renamed.status_code == 200
        assert renamed.json()["title"] == "Renamed"
        assert renamed.json()["status"] == "archived"

        from main import app

        app.dependency_overrides[get_current_user] = lambda: {
            "sub": "user_other",
            "email": "other@example.com",
        }
        try:
            forbidden = await client.get(
                f"/api/chat/conversations/{conversation['id']}"
            )
            assert forbidden.status_code == 403
        finally:
            app.dependency_overrides[get_current_user] = lambda: MOCK_USER

    async def test_document_selection_is_explicit_and_owner_checked(
        self, client, create_owned_file
    ):
        selected = await create_owned_file(file_name="selected.pdf")
        other = await create_owned_file(file_name="other.pdf")
        conversation = await _create_conversation(client, document_ids=[selected])

        retrieval = AsyncMock(return_value=[])
        with patch("routers.conversations.document_index_service.search", retrieval), patch(
            "routers.conversations.provider_service.stream_chat",
            side_effect=_provider_stream("The excerpts are not enough information."),
        ):
            response = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(uuid.uuid4()),
                    "content": "What is selected?",
                    "reasoning": False,
                },
            )

        assert response.status_code == 200
        assert retrieval.await_count == 1
        assert retrieval.await_args.kwargs["file_ids"] == [uuid.UUID(selected)]
        assert uuid.UUID(other) not in retrieval.await_args.kwargs["file_ids"]

    async def test_lifecycle_document_controls_and_pagination(
        self, client, create_owned_file
    ):
        invalid_document = await client.post(
            "/api/chat/conversations",
            json={"mode": "document", "documentIds": []},
        )
        assert invalid_document.status_code == 400

        conversation = await _create_conversation(client)
        conversation_id = conversation["id"]
        listed = await client.get("/api/chat/conversations")
        assert [item["id"] for item in listed.json()] == [conversation_id]
        fetched = await client.get(f"/api/chat/conversations/{conversation_id}")
        assert fetched.status_code == 200

        no_document = await client.patch(
            f"/api/chat/conversations/{conversation_id}",
            json={"mode": "document"},
        )
        assert no_document.status_code == 400
        bad_model = await client.patch(
            f"/api/chat/conversations/{conversation_id}",
            json={"modelId": "not-a-model"},
        )
        assert bad_model.status_code == 400

        processing_file = await create_owned_file(
            file_name="processing.pdf", status="processing"
        )
        not_ready = await client.put(
            f"/api/chat/conversations/{conversation_id}/documents",
            json={"documentIds": [processing_file]},
        )
        assert not_ready.status_code == 409
        missing = await client.put(
            f"/api/chat/conversations/{conversation_id}/documents",
            json={"documentIds": [str(uuid.uuid4())]},
        )
        assert missing.status_code == 404

        file_id = await create_owned_file(file_name="selected.pdf")
        selected = await client.put(
            f"/api/chat/conversations/{conversation_id}/documents",
            json={"documentIds": [file_id]},
        )
        assert selected.status_code == 200
        assert selected.json()["mode"] == "document"
        assert selected.json()["documentIds"] == [file_id]

        updated = await client.patch(
            f"/api/chat/conversations/{conversation_id}",
            json={
                "title": "Lifecycle thread",
                "status": "archived",
                "mode": "document",
                "modelId": "gpt-oss-120b",
            },
        )
        assert updated.status_code == 200
        assert updated.json()["selectedModelId"] == "gpt-oss-120b"
        assert (await client.get("/api/chat/conversations")).json() == []
        archived = await client.get(
            "/api/chat/conversations", params={"includeArchived": True}
        )
        assert archived.json()[0]["status"] == "archived"

        await client.patch(
            f"/api/chat/conversations/{conversation_id}",
            json={"status": "active"},
        )
        async with test_session_factory() as db:
            base = datetime.utcnow()
            db.add_all(
                [
                    ConversationMessage(
                        conversation_id=uuid.UUID(conversation_id),
                        role="user",
                        content=f"message {index}",
                        status="complete",
                        created_at=base + timedelta(seconds=index),
                        completed_at=base + timedelta(seconds=index),
                    )
                    for index in range(3)
                ]
            )
            await db.commit()

        first_page = await client.get(
            f"/api/chat/conversations/{conversation_id}/messages",
            params={"limit": 2},
        )
        assert first_page.status_code == 200
        assert len(first_page.json()["items"]) == 2
        assert first_page.json()["nextCursor"] is not None
        second_page = await client.get(
            f"/api/chat/conversations/{conversation_id}/messages",
            params={"limit": 2, "cursor": first_page.json()["nextCursor"]},
        )
        assert second_page.status_code == 200
        assert second_page.json()["items"]

        cleared = await client.put(
            f"/api/chat/conversations/{conversation_id}/documents",
            json={"documentIds": []},
        )
        assert cleared.json()["mode"] == "general"
        deleted = await client.delete(f"/api/chat/conversations/{conversation_id}")
        assert deleted.status_code == 204
        assert (await client.get(f"/api/chat/conversations/{conversation_id}")).status_code == 404

    async def test_missing_subject_is_rejected(self):
        with pytest.raises(Exception) as exc:
            _owner_sub({"email": "nobody@example.com"})
        assert exc.value.status_code == 401


@pytest.mark.asyncio
class TestConversationExecution:
    async def test_general_chat_never_retrieves_documents(self, client):
        conversation = await _create_conversation(client)
        retrieval = AsyncMock(return_value=[])

        with patch("routers.conversations.document_index_service.search", retrieval), patch(
            "routers.conversations.provider_service.stream_chat",
            side_effect=_provider_stream("A general answer."),
        ):
            response = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(uuid.uuid4()),
                    "content": "Hello",
                    "reasoning": False,
                },
            )

        assert response.status_code == 200
        retrieval.assert_not_awaited()
        assert any(event["type"] == "message.completed" for event in _events(response))

    async def test_follow_up_receives_completed_prior_turns(self, client):
        conversation = await _create_conversation(client)
        captured: list[list[dict[str, str]]] = []

        async def stream(_model, messages, **_kwargs):
            captured.append(messages)
            answer = "First answer" if len(captured) == 1 else "Second answer"
            async for event in _provider_stream(answer)():
                yield event

        with patch(
            "routers.conversations.provider_service.stream_chat",
            side_effect=stream,
        ):
            for question in ("Remember alpha", "What did I ask before?"):
                response = await client.post(
                    f"/api/chat/conversations/{conversation['id']}/messages",
                    json={
                        "requestId": str(uuid.uuid4()),
                        "content": question,
                        "reasoning": False,
                    },
                )
                assert response.status_code == 200

        second_prompt = captured[1]
        assert any(message["content"] == "Remember alpha" for message in second_prompt)
        assert any(message["content"] == "First answer" for message in second_prompt)

    async def test_verified_citation_is_persisted_and_navigable(
        self, client, create_owned_file
    ):
        file_id = await create_owned_file(file_name="paper.pdf")
        chunk_id = uuid.uuid4()
        async with test_session_factory() as db:
            db.add(
                DocumentChunk(
                    id=chunk_id,
                    file_id=uuid.UUID(file_id),
                    owner_sub=MOCK_USER["sub"],
                    ordinal=0,
                    text="Transformers use self-attention.",
                    search_text="Transformers use self-attention.",
                    page_start=3,
                    page_end=3,
                    content_hash="a" * 64,
                    embedding_model="test",
                    embedding_version="test-v1",
                    embedding=[0.1] * 384,
                )
            )
            await db.commit()

        conversation = await _create_conversation(client, document_ids=[file_id])
        source = {
            "id": str(chunk_id),
            "file_id": file_id,
            "text": "Transformers use self-attention.",
            "page_start": 3,
            "page_end": 3,
            "start_time": None,
            "end_time": None,
            "score": 0.95,
            "rank": 1,
            "ordinal": 0,
        }

        with patch(
            "routers.conversations.document_index_service.search",
            new=AsyncMock(return_value=[source]),
        ), patch(
            "routers.conversations.provider_service.stream_chat",
            side_effect=_provider_stream("It uses self-attention [[S1]]."),
        ):
            response = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(uuid.uuid4()),
                    "content": "What does it use?",
                    "reasoning": False,
                },
            )

        assert response.status_code == 200
        citation_event = next(
            event for event in _events(response) if event["type"] == "citation"
        )
        assert citation_event["citation"]["pageStart"] == 3
        assert citation_event["citation"]["fileId"] == file_id

        history = await client.get(
            f"/api/chat/conversations/{conversation['id']}/messages"
        )
        assistant = history.json()["items"][-1]
        assert assistant["citations"][0]["sourceLabel"] == "S1"
        assert assistant["citations"][0]["excerpt"] == source["text"]

    async def test_invalid_marker_gets_one_bounded_repair(
        self, client, create_owned_file
    ):
        file_id = await create_owned_file(file_name="repair.pdf")
        chunk_id = uuid.uuid4()
        async with test_session_factory() as db:
            db.add(
                DocumentChunk(
                    id=chunk_id,
                    file_id=uuid.UUID(file_id),
                    owner_sub=MOCK_USER["sub"],
                    ordinal=0,
                    text="Grounded fact.",
                    search_text="Grounded fact.",
                    page_start=1,
                    page_end=1,
                    content_hash="b" * 64,
                    embedding_model="test",
                    embedding_version="test-v1",
                    embedding=[0.1] * 384,
                )
            )
            await db.commit()
        conversation = await _create_conversation(client, document_ids=[file_id])
        source = {
            "id": str(chunk_id),
            "file_id": file_id,
            "text": "Grounded fact.",
            "page_start": 1,
            "page_end": 1,
            "start_time": None,
            "end_time": None,
            "score": 1.0,
            "rank": 1,
            "ordinal": 0,
        }
        repair = AsyncMock(
            return_value=(
                "A grounded answer [[S1]].",
                {"provider": "cerebras", "fallbackUsed": False},
            )
        )

        with patch(
            "routers.conversations.document_index_service.search",
            new=AsyncMock(return_value=[source]),
        ), patch(
            "routers.conversations.provider_service.stream_chat",
            side_effect=_provider_stream("An invalid answer [[S99]]."),
        ), patch("routers.conversations.provider_service.complete", repair):
            response = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(uuid.uuid4()),
                    "content": "Repair this",
                    "reasoning": False,
                },
            )

        completed = next(
            event for event in _events(response) if event["type"] == "message.completed"
        )
        assert completed["content"] == "A grounded answer [[S1]]."
        repair.assert_awaited_once()

    async def test_duplicate_request_is_one_message_and_one_charge(self, client):
        conversation = await _create_conversation(client)
        request_id = str(uuid.uuid4())
        stream = _provider_stream("Only once.")

        with patch(
            "routers.conversations.provider_service.stream_chat",
            side_effect=stream,
        ) as provider:
            payload = {
                "requestId": request_id,
                "content": "Deduplicate me",
                "reasoning": False,
            }
            first = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json=payload,
            )
            second = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json=payload,
            )

        assert first.status_code == second.status_code == 200
        assert provider.call_count == 1
        async with test_session_factory() as db:
            ledgers = int(
                (
                    await db.execute(
                        select(func.count()).select_from(UsageLedger).where(
                            UsageLedger.request_id == uuid.UUID(request_id)
                        )
                    )
                ).scalar()
                or 0
            )
            assistants = int(
                (
                    await db.execute(
                        select(func.count()).select_from(ConversationMessage).where(
                            ConversationMessage.request_id == uuid.UUID(request_id)
                        )
                    )
                ).scalar()
                or 0
            )
        assert ledgers == 1
        assert assistants == 1

    async def test_reasoning_reserves_surcharge_and_failure_refunds(self, client):
        conversation = await _create_conversation(client)
        request_id = uuid.uuid4()

        async def failed_stream(*_args, **_kwargs):
            if False:
                yield {}
            raise ProviderUnavailable("provider unavailable")

        with patch(
            "routers.conversations.provider_service.stream_chat",
            side_effect=failed_stream,
        ):
            response = await client.post(
                f"/api/chat/conversations/{conversation['id']}/messages",
                json={
                    "requestId": str(request_id),
                    "content": "Think and fail",
                    "modelId": "gpt-oss-120b",
                    "reasoning": True,
                },
            )

        failed = next(event for event in _events(response) if event["type"] == "message.failed")
        assert failed["error"]["retryable"] is True
        async with test_session_factory() as db:
            ledger = (
                await db.execute(
                    select(UsageLedger).where(UsageLedger.request_id == request_id)
                )
            ).scalar_one()
            citation_count = int(
                (await db.execute(select(func.count()).select_from(MessageCitation))).scalar()
                or 0
            )
        assert ledger.reserved_units == 4
        assert ledger.refunded_units == 4
        assert ledger.status == "refunded"
        assert citation_count == 0

    async def test_message_validation_retry_and_event_replay(self, client):
        conversation = await _create_conversation(client)
        conversation_id = uuid.UUID(conversation["id"])

        await client.patch(
            f"/api/chat/conversations/{conversation_id}",
            json={"status": "archived"},
        )
        archived = await client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            json={"requestId": str(uuid.uuid4()), "content": "No"},
        )
        assert archived.status_code == 409

        async with test_session_factory() as db:
            record = (
                await db.execute(select(Conversation).where(Conversation.id == conversation_id))
            ).scalar_one()
            record.status = "active"
            record.mode = "document"
            await db.commit()
        no_documents = await client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            json={"requestId": str(uuid.uuid4()), "content": "No context"},
        )
        assert no_documents.status_code == 400

        async with test_session_factory() as db:
            record = (
                await db.execute(select(Conversation).where(Conversation.id == conversation_id))
            ).scalar_one()
            record.mode = "general"
            user_message = ConversationMessage(
                conversation_id=conversation_id,
                role="user",
                content="Original question",
                status="complete",
                completed_at=datetime.utcnow(),
            )
            db.add(user_message)
            await db.flush()
            failed = ConversationMessage(
                conversation_id=conversation_id,
                parent_message_id=user_message.id,
                role="assistant",
                content="",
                status="failed",
                model_id="gpt-oss-120b",
                reasoning=True,
                error_code="provider_unavailable",
            )
            db.add(failed)
            await db.commit()
            failed_id = failed.id

        unsupported = await client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            json={
                "requestId": str(uuid.uuid4()),
                "content": "Bad model",
                "modelId": "unknown",
            },
        )
        assert unsupported.status_code == 400

        with patch(
            "routers.conversations.provider_service.stream_chat",
            side_effect=_provider_stream("Recovered answer."),
        ):
            retried = await client.post(
                f"/api/chat/conversations/{conversation_id}/messages/{failed_id}/retry",
                json={"requestId": str(uuid.uuid4()), "reasoning": False},
            )
        assert retried.status_code == 200
        retry_events = _events(retried)
        completed = next(event for event in retry_events if event["type"] == "message.completed")
        retried_message_id = completed["messageId"]

        replay = await client.get(
            f"/api/chat/conversations/{conversation_id}/messages/{retried_message_id}/events",
            headers={"Last-Event-ID": "invalid"},
        )
        assert replay.status_code == 200
        assert _events(replay)[-1]["type"] == "message.completed"

        missing = await client.get(
            f"/api/chat/conversations/{conversation_id}/messages/{uuid.uuid4()}/events"
        )
        assert missing.status_code == 404
        not_retryable = await client.post(
            f"/api/chat/conversations/{conversation_id}/messages/{retried_message_id}/retry",
            json={"requestId": str(uuid.uuid4())},
        )
        assert not_retryable.status_code == 409

    async def test_citation_repair_failure_and_summary_queue(self, monkeypatch):
        model = resolve_chat_model("gpt-oss-120b", False)
        assert model is not None
        sources = [
            {
                "label": "S1",
                "file_name": "source.pdf",
                "text": "Grounded source",
                "page_start": 1,
                "page_end": 1,
            }
        ]
        with patch(
            "routers.conversations.provider_service.complete",
            new=AsyncMock(side_effect=ProviderUnavailable("offline")),
        ):
            unchanged, metadata = await _repair_citations("No marker", sources, model)
        assert unchanged == "No marker"
        assert metadata is None

        with patch(
            "routers.conversations.provider_service.complete",
            new=AsyncMock(return_value=("Still invalid", {"provider": "cerebras"})),
        ):
            invalid, metadata = await _repair_citations("No marker", sources, model)
        assert invalid == "No marker"
        assert metadata is None

        monkeypatch.setattr("routers.conversations.settings.CHAT_SUMMARY_MESSAGE_THRESHOLD", 2)
        conversation_id = uuid.uuid4()
        async with test_session_factory() as db:
            conversation = Conversation(
                id=conversation_id,
                owner_sub=MOCK_USER["sub"],
                title="Summary",
            )
            db.add(conversation)
            await db.flush()
            messages = [
                ConversationMessage(
                    conversation_id=conversation_id,
                    role=role,
                    content=role,
                    status="complete",
                    completed_at=datetime.utcnow(),
                )
                for role in ("user", "assistant")
            ]
            db.add_all(messages)
            await db.flush()
            await _queue_summary_if_due(db, conversation, messages[-1].id)
            await db.commit()
            queued = int(
                (await db.execute(select(func.count()).select_from(OutboxEvent))).scalar() or 0
            )
        assert queued == 1

        with pytest.raises(Exception) as exc:
            _resolve_model("unsupported", False)
        assert exc.value.status_code == 400
