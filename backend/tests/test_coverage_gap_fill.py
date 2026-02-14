
import pytest
import uuid
from unittest.mock import MagicMock, patch, AsyncMock
from core.usage_limits import UsageLimiter
from fastapi import HTTPException
from models.user import User

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
        u = User(email="existing@example.com", name="Existing")
        db_session.add(u)
        await db_session.commit()
        
        resp = await client.post(
            "/api/users", 
            json={"email": "existing@example.com", "name": "New Name"}
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
        """Test updating a non-existent user."""
        resp = await client.patch(
            "/api/users/notfound@example.com",
            json={"name": "New Name"}
        )
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestChatGapFill:
    """Targeted tests for Chat router coverage gaps."""

    async def test_chat_ask_cached(self, client):
        """Test chat ask returns cached response."""
        file_id = str(uuid.uuid4())
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

    async def test_chat_ask_error(self, client, mock_embedding_service):
        """Test chat ask handles exceptions gracefully."""
        file_id = str(uuid.uuid4())
        
        mock_embedding_service.search_similar.return_value = []
        
        # Mock AI service raising error
        with patch("services.ai_service.ai_service.chat_stream") as mock_stream:
            mock_stream.side_effect = Exception("AI Error")
            
            resp = await client.post(
                "/api/chat/ask",
                json={"file_id": file_id, "question": "q"}
            )
            assert resp.status_code == 200
            assert "AI Error" in resp.text

    async def test_summarize_cached(self, client, db_session):
        """Test summarize returns cached response."""
        from models.file import File
        file_id = str(uuid.uuid4())
        f = File(file_id=uuid.UUID(file_id), file_name="f", file_type="audio", storage_key="k", created_by="u", transcript="t", status="ready")
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
        f = File(file_id=uuid.UUID(file_id), file_name="f", file_type="audio", storage_key="k", created_by="u", transcript=long_text, status="ready")
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
             assert "Summary Error" in resp.text

