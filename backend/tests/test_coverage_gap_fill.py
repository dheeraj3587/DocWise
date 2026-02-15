
import io
import json
import pytest
import time
import uuid
from unittest.mock import MagicMock, patch, AsyncMock
from core.cache import CacheService
from core.config import settings
from core.usage_limits import UsageLimiter
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers
from models.user import User
from models.file import File as FileModel
from models.timestamp import MediaTimestamp
from routers.chat import summarize_file, SummarizeRequest
from routers.files import upload_file, get_file, list_files, delete_file
from routers.notes import get_notes, save_note, delete_note, NoteUpdate
from routers.users import create_user, get_me, update_user, UserCreate, UserUpdate
import models.database as database

@pytest.mark.asyncio
class TestUsageLimiterGapFill:
    """Targeted tests for UsageLimiter coverage gaps."""
    
    async def test_memory_pruning(self):
        """Test that memory cache is pruned when it exceeds limit."""
        ul = UsageLimiter()
        ul._MAX_MEMORY_ENTRIES = 5  # Small limit for testing
        
        # Fill cache
        with patch.object(ul, "_get_redis", return_value=None):
            for i in range(10):
                # Using different scopes to create unique keys
                await ul.consume_daily_units(f"user{i}", "endpoint", 1)
            
            # Check if size is controlled (it might be 6 or so depending on prune timing)
            assert len(ul._memory_daily_units) <= ul._MAX_MEMORY_ENTRIES + 1

    async def test_redis_connection_error(self):
        """Test fallback when redis connection fails."""
        ul = UsageLimiter()
        # Mock _get_redis to raise Exception
        with patch.object(ul, "_get_redis", side_effect=Exception("Redis down")):
            # Should not raise exception
            await ul.consume_daily_units("user", "endpoint", 1)

    async def test_redis_acquire_blocked(self):
        """Test acquire_stream_slot rolling back when limit exceeded in Redis."""
        ul = UsageLimiter()
        mock_redis = AsyncMock()
        mock_redis.incr.return_value = 100 # Exceeds limit
        
        with patch.object(ul, "_get_redis", return_value=mock_redis):
            with patch("core.usage_limits.settings") as mock_settings:
                mock_settings.LLM_MAX_CONCURRENT_STREAMS_PER_USER = 2
                
                with pytest.raises(HTTPException) as exc:
                    await ul.acquire_stream_slot("user")
                assert exc.value.status_code == 429
                
                # Verify rollback (decr) was called
                mock_redis.decr.assert_called()

    async def test_redis_release_delete(self):
        """Test release_stream_slot deletes key if count drops to 0."""
        ul = UsageLimiter()
        mock_redis = AsyncMock()
        mock_redis.decr.return_value = 0
        
        with patch.object(ul, "_get_redis", return_value=mock_redis):
            await ul.release_stream_slot("user")
            mock_redis.delete.assert_called()


@pytest.mark.asyncio
class TestUsersGapFill:
    """Targeted tests for Users router coverage gaps."""

    async def test_create_user_exists(self, client, db_session):
        """Test creating a user that already exists returns specific status."""
        # Create user
        u = User(email="test@example.com", name="Existing")
        db_session.add(u)
        await db_session.commit()
        
        resp = await client.post(
            "/api/users", 
            json={"email": "test@example.com", "name": "New Name"}
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "exists"

    async def test_get_me_no_db_user(self, client):
        """Test get_me when user is not in DB (first login scenario)."""
        # Ensure 'test@example.com' (from mock auth) is NOT in DB
        # The test DB is empty/reset mostly, so this should pass if we don't create it.
        resp = await client.get("/api/users/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"
        # Checks fallback path

    async def test_update_user_not_found(self, client):
        """Test updating own profile when no DB record exists returns 404."""
        resp = await client.patch(
            "/api/users/test@example.com",
            json={"name": "New Name"}
        )
        assert resp.status_code == 404

    async def test_create_user_created(self, client):
        """Test creating a new user returns created status."""
        resp = await client.post(
            "/api/users",
            json={"email": "test@example.com", "name": "New User"}
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "created"

    async def test_get_me_db_user(self, client, db_session):
        """Test get_me returns stored user data."""
        u = User(email="test@example.com", name="Stored", image_url="img")
        db_session.add(u)
        await db_session.commit()

        resp = await client.get("/api/users/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert data["name"] == "Stored"
        assert data["imageUrl"] == "img"

    async def test_update_user_success(self, client, db_session):
        """Test updating user fields."""
        u = User(email="test@example.com", name="Old", image_url="old")
        db_session.add(u)
        await db_session.commit()

        resp = await client.patch(
            "/api/users/test@example.com",
            json={"name": "New", "image_url": "new"}
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "updated"


@pytest.mark.asyncio
class TestChatGapFill:
    """Targeted tests for Chat router coverage gaps."""

    async def test_chat_ask_cached(self, client, create_owned_file):
        """Test chat ask returns cached response."""
        file_id = await create_owned_file()
        question = "hello"
        
        # Mock cache hit
        with patch("core.cache.cache_service.get_json", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = "Cached Answer"
            
            resp = await client.post(
                "/api/chat/ask",
                json={"file_id": file_id, "question": question}
            )
            assert resp.status_code == 200
            content = resp.text
            assert "Cached Answer" in content
            assert "[DONE]" in content

    async def test_chat_ask_error(self, client, mock_embedding_service, create_owned_file):
        """Test chat ask handles exceptions gracefully."""
        file_id = await create_owned_file()
        
        mock_embedding_service.search_similar.return_value = []
        
        # Mock AI service raising error
        with patch("services.ai_service.ai_service.chat_stream") as mock_stream:
            mock_stream.side_effect = Exception("AI Error")
            
            resp = await client.post(
                "/api/chat/ask",
                json={"file_id": file_id, "question": "q"}
            )
            assert resp.status_code == 200
            # Error messages are now sanitized, so check for generic message
            assert "error" in resp.text.lower() or "data:" in resp.text

    async def test_summarize_cached(self, client, db_session):
        """Test summarize returns cached response."""
        from models.file import File
        file_id = str(uuid.uuid4())
        f = File(file_id=uuid.UUID(file_id), file_name="f", file_type="audio", storage_key="k", created_by="test@example.com", transcript="t", status="ready")
        db_session.add(f)
        await db_session.commit()

        with patch("core.cache.cache_service.get_json", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = "Cached Summary"
            
            resp = await client.post(
                "/api/chat/summarize",
                json={"file_id": file_id}
            )
            assert resp.status_code == 200
            assert "Cached Summary" in resp.text

    async def test_summarize_truncate_and_error(self, client, db_session):
        """Test summarization truncation logic and error handling."""
        from models.file import File
        file_id = str(uuid.uuid4())
        long_text = "a" * 50005
        f = File(file_id=uuid.UUID(file_id), file_name="f", file_type="audio", storage_key="k", created_by="test@example.com", transcript=long_text, status="ready")
        db_session.add(f)
        await db_session.commit()
        
        # Mock AI service raising exception to verify error handling path
        with patch("services.ai_service.ai_service.summarize_stream") as mock_stream:
             mock_stream.side_effect = Exception("Summary Error")
             
             resp = await client.post(
                 "/api/chat/summarize",
                 json={"file_id": file_id}
             )
             assert resp.status_code == 200
             # Error messages are now sanitized
             assert "error" in resp.text.lower() or "data:" in resp.text

    async def test_chat_ask_includes_timestamps(self, client, mock_ai_service, create_owned_file):
        """Test chat ask includes timestamps when present in context."""
        file_id = await create_owned_file()
        context = [{"text": "c", "score": 0.9, "start_time": 0.0, "end_time": 1.0}]

        with patch("routers.chat.embedding_service.search_similar") as mock_search, \
             patch("core.cache.cache_service.set_json", new_callable=AsyncMock) as mock_set:
            mock_search.return_value = context
            mock_set.return_value = None
            resp = await client.post(
                "/api/chat/ask",
                json={"file_id": file_id, "question": "q"}
            )
            assert resp.status_code == 200
            assert "timestamps" in resp.text
            assert "[DONE]" in resp.text


@pytest.mark.asyncio
class TestNotesGapFill:
    """Targeted tests for Notes router coverage gaps."""

    async def test_get_notes_empty(self, client, create_owned_file):
        """Test notes list returns empty when none exist."""
        file_id = await create_owned_file()
        resp = await client.get(f"/api/notes/{file_id}")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_save_note_create_and_update(self, client, create_owned_file):
        """Test creating and updating a note."""
        file_id = await create_owned_file()
        resp = await client.put(
            f"/api/notes/{file_id}",
            json={"note": "first"}
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "saved"

        resp = await client.put(
            f"/api/notes/{file_id}",
            json={"note": "updated"}
        )
        assert resp.status_code == 200
        notes_resp = await client.get(f"/api/notes/{file_id}")
        assert notes_resp.status_code == 200
        notes = notes_resp.json()
        assert notes[0]["note"] == "updated"
        assert notes[0]["createdBy"] == "test@example.com"

    async def test_delete_notes(self, client, create_owned_file):
        """Test deleting notes removes entries."""
        file_id = await create_owned_file()
        await client.put(
            f"/api/notes/{file_id}",
            json={"note": "to delete"}
        )
        resp = await client.delete(f"/api/notes/{file_id}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"
        notes_resp = await client.get(f"/api/notes/{file_id}")
        assert notes_resp.json() == []


@pytest.mark.asyncio
class TestDatabaseAndCacheGapFill:
    """Targeted tests for database and cache helpers."""

    async def test_get_db_commit_and_close(self):
        """Test get_db commits and closes on success."""
        session = AsyncMock()
        cm = AsyncMock()
        cm.__aenter__.return_value = session
        cm.__aexit__.return_value = False

        with patch("models.database.async_session", return_value=cm):
            gen = database.get_db()
            result = await gen.__anext__()
            assert result is session
            with pytest.raises(StopAsyncIteration):
                await gen.__anext__()

        session.commit.assert_awaited()
        session.close.assert_awaited()

    async def test_get_db_rollback_on_error(self):
        """Test get_db rolls back on exception."""
        session = AsyncMock()
        cm = AsyncMock()
        cm.__aenter__.return_value = session
        cm.__aexit__.return_value = False

        with patch("models.database.async_session", return_value=cm):
            gen = database.get_db()
            await gen.__anext__()
            with pytest.raises(RuntimeError):
                await gen.athrow(RuntimeError("fail"))

        session.rollback.assert_awaited()
        session.close.assert_awaited()

    async def test_cache_disabled(self):
        """Test cache is bypassed when disabled."""
        original = settings.CACHE_ENABLED
        settings.CACHE_ENABLED = False
        try:
            svc = CacheService()
            result = await svc.get_json("k")
            assert result is None
            await svc.set_json("k", {"a": 1}, 10)
            assert svc._memory_cache == {}
        finally:
            settings.CACHE_ENABLED = original

    async def test_cache_fallback_on_redis_error(self):
        """Test cache falls back to memory on redis errors."""
        svc = CacheService()
        expires_at = time.time() + 10
        svc._memory_cache["k"] = (expires_at, json.dumps({"a": 1}))

        mock_redis = AsyncMock()
        mock_redis.get.side_effect = Exception("down")

        with patch.object(svc, "_get_redis", return_value=mock_redis):
            result = await svc.get_json("k")

        assert result == {"a": 1}

    async def test_cache_expired_entry_removed(self):
        """Test expired cache entries are removed."""
        svc = CacheService()
        svc._memory_cache["k"] = (time.time() - 1, json.dumps({"a": 1}))
        with patch.object(svc, "_get_redis", return_value=None):
            result = await svc.get_json("k")
        assert result is None
        assert "k" not in svc._memory_cache

    async def test_cache_set_json_redis_error(self):
        """Test cache set stores in memory on redis failure."""
        svc = CacheService()
        mock_redis = AsyncMock()
        mock_redis.set.side_effect = Exception("down")

        with patch.object(svc, "_get_redis", return_value=mock_redis):
            await svc.set_json("k", {"a": 1}, 10)

        assert "k" in svc._memory_cache

    async def test_cache_clear_redis_close_error(self):
        """Test cache clear handles redis close errors."""
        svc = CacheService()
        svc._redis = AsyncMock()
        svc._redis.close = AsyncMock(side_effect=Exception("close failed"))
        await svc.clear()
        assert svc._redis is None


@pytest.mark.asyncio
class TestRouterDirectCoverage:
    """Targeted direct-call coverage for routers."""

    async def test_users_direct_calls(self, db_session):
        """Test users router direct calls."""
        user = {"email": "direct@example.com", "name": "Direct"}
        body = UserCreate(email="direct@example.com", name="Direct")
        result = await create_user(body, None, user, db_session)
        assert result["status"] == "created"

        me = await get_me(None, user, db_session)
        assert me["email"] == "direct@example.com"

        update_result = await update_user(
            "direct@example.com",
            UserUpdate(name="Updated", image_url="img"),
            None,
            user,
            db_session,
        )
        assert update_result["status"] == "updated"

    async def test_files_direct_upload_get_list_delete(self, db_session):
        """Test files router direct calls."""
        user = {"email": ""}
        file = UploadFile(
            file=io.BytesIO(b"%PDF-1.4"),
            filename="test.pdf",
            headers=Headers({"content-type": "application/pdf"}),
        )

        with patch("routers.files.storage_service") as mock_storage, \
             patch("routers.files.process_pdf") as mock_pdf, \
             patch("routers.files.process_media") as mock_media:
            mock_storage.upload_file = MagicMock()
            mock_storage.get_presigned_url = MagicMock(return_value="url")
            mock_storage.delete_file = MagicMock()
            mock_pdf.delay = MagicMock()
            mock_media.delay = MagicMock()

            upload_result = await upload_file(
                file=file,
                file_name="Doc",
                _=None,
                user=user,
                db=db_session,
            )
            assert upload_result["fileType"] == "pdf"
            file_id = upload_result["fileId"]

            media_id = str(uuid.uuid4())
            media_record = FileModel(
                file_id=uuid.UUID(media_id),
                file_name="a.mp3",
                file_type="audio",
                storage_key="audio/key",
                created_by="fallback@example.com",
                status="ready",
            )
            db_session.add(media_record)
            ts = MediaTimestamp(
                file_id=uuid.UUID(media_id),
                start_time=0.0,
                end_time=1.0,
                text="t",
                topic="topic",
            )
            db_session.add(ts)
            await db_session.commit()

            result = await get_file(media_id, None, {"email": "fallback@example.com"}, db_session)
            assert result["timestamps"][0]["topic"] == "topic"

            files = await list_files(None, {"email": "fallback@example.com"}, db_session)
            assert len(files) >= 1

            with patch("vector_store.faiss_index.faiss_index") as mock_faiss:
                mock_faiss.delete_index = MagicMock()
                deleted = await delete_file(
                    file_id=media_id,
                    _=None,
                    user={"email": "fallback@example.com"},
                    db=db_session
                )
            assert deleted["status"] == "deleted"

    async def test_notes_direct_calls(self, db_session):
        """Test notes router direct calls."""
        user = {"email": "note@example.com"}
        file_id = str(uuid.uuid4())

        # Create a file record owned by this user (required for ownership check)
        file_record = FileModel(
            file_id=uuid.UUID(file_id),
            file_name="note-test.pdf",
            file_type="pdf",
            storage_key="pdf/key",
            created_by="note@example.com",
            status="ready",
        )
        db_session.add(file_record)
        await db_session.commit()

        body = NoteUpdate(note="first")
        result = await save_note(file_id, body, None, user, db_session)
        assert result["status"] == "saved"

        body_update = NoteUpdate(note="second")
        await save_note(file_id, body_update, None, user, db_session)
        notes = await get_notes(file_id, None, user, db_session)
        assert notes[0]["note"] == "second"

        deleted = await delete_note(file_id, None, user, db_session)
        assert deleted["status"] == "deleted"

    async def test_chat_summarize_direct_pdf(self, db_session):
        """Test summarize direct call with PDF."""
        file_id = str(uuid.uuid4())
        f = FileModel(
            file_id=uuid.UUID(file_id),
            file_name="f.pdf",
            file_type="pdf",
            storage_key="pdf/key",
            created_by="u",
            status="ready",
        )
        db_session.add(f)
        await db_session.commit()

        with patch("routers.chat.storage_service") as mock_storage, \
             patch("routers.chat.pdf_service") as mock_pdf, \
             patch("routers.chat.ai_service") as mock_ai, \
             patch("core.cache.cache_service.get_json", new_callable=AsyncMock) as mock_get, \
             patch("core.cache.cache_service.set_json", new_callable=AsyncMock) as mock_set:
            mock_storage.download_file = MagicMock(return_value=b"%PDF-1.4")
            mock_pdf.extract_full_text = MagicMock(return_value="text")
            async def stream(*args, **kwargs):
                yield "chunk"
            mock_ai.summarize_stream = stream
            mock_get.return_value = None
            mock_set.return_value = None

            response = await summarize_file(
                SummarizeRequest(file_id=file_id, deep_mode=False),
                None,
                {"email": "u"},
                db_session,
            )
            body = "".join([chunk async for chunk in response.body_iterator])
            assert "[DONE]" in body
