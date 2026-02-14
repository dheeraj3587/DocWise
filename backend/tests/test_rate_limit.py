"""Tests for core.rate_limit — RateLimiter and dependency."""

import time
from unittest.mock import patch, AsyncMock

import pytest
from fastapi import HTTPException

from core.rate_limit import RateLimiter, _resolve_limit


@pytest.mark.asyncio
class TestRateLimiter:
    """Tests for the RateLimiter class (memory fallback)."""

    async def test_allows_within_limit(self):
        rl = RateLimiter()
        rl._redis = None
        with patch.object(rl, "_get_redis", new_callable=AsyncMock, return_value=None):
            allowed, remaining = await rl.hit("test:key:1", limit=5, window_seconds=60)
        assert allowed is True
        assert remaining == 4

    async def test_blocks_over_limit(self):
        rl = RateLimiter()
        rl._redis = None
        with patch.object(rl, "_get_redis", new_callable=AsyncMock, return_value=None):
            for _ in range(5):
                await rl.hit("test:key:2", limit=5, window_seconds=60)
            allowed, remaining = await rl.hit("test:key:2", limit=5, window_seconds=60)
        assert allowed is False
        assert remaining == 0

    async def test_window_reset(self):
        rl = RateLimiter()
        rl._redis = None
        with patch.object(rl, "_get_redis", new_callable=AsyncMock, return_value=None):
            # Fill to limit
            for _ in range(3):
                await rl.hit("test:key:3", limit=3, window_seconds=60)

            # Manually expire the window
            async with rl._lock:
                key = "test:key:3"
                current, _ = rl._memory_counts[key]
                rl._memory_counts[key] = (current, time.time() - 1)

            allowed, remaining = await rl.hit("test:key:3", limit=3, window_seconds=60)
        assert allowed is True

    async def test_clear(self):
        rl = RateLimiter()
        rl._redis = None
        with patch.object(rl, "_get_redis", new_callable=AsyncMock, return_value=None):
            await rl.hit("test:key:4", limit=5, window_seconds=60)
        await rl.clear()
        assert len(rl._memory_counts) == 0


        assert len(rl._memory_counts) == 0


@pytest.mark.asyncio
class TestRateLimiterRedis:
    """Tests for RateLimiter using mock Redis."""

    @pytest.mark.asyncio
    async def test_hit_redis_allowed(self):
        rl = RateLimiter()
        mock_redis = AsyncMock()
        # Mock incr returning 1
        mock_redis.incr.return_value = 1
        
        with patch.object(rl, "_get_redis", new_callable=AsyncMock, return_value=mock_redis):
            allowed, remaining = await rl.hit("key", limit=5, window_seconds=60)

        assert allowed is True
        assert remaining == 4
        mock_redis.incr.assert_called_with("key")
        mock_redis.expire.assert_called_with("key", 60)

    @pytest.mark.asyncio
    async def test_hit_redis_blocked(self):
        rl = RateLimiter()
        mock_redis = AsyncMock()
        # Count > limit
        mock_redis.incr.return_value = 6
        
        with patch.object(rl, "_get_redis", new_callable=AsyncMock, return_value=mock_redis):
            allowed, remaining = await rl.hit("key", limit=5, window_seconds=60)

        assert allowed is False
        assert remaining == 0
        mock_redis.incr.assert_called_with("key")

    @pytest.mark.asyncio
    async def test_hit_redis_error_falls_back_to_memory(self):
        rl = RateLimiter()
        mock_redis = AsyncMock()
        mock_redis.incr.side_effect = Exception("down")

        with patch.object(rl, "_get_redis", new_callable=AsyncMock, return_value=mock_redis):
            allowed, remaining = await rl.hit("key", limit=2, window_seconds=60)

        assert allowed is True
        assert remaining == 1

    @pytest.mark.asyncio
    async def test_clear_handles_redis_close_error(self):
        rl = RateLimiter()
        rl._redis = AsyncMock()
        rl._redis.close = AsyncMock(side_effect=Exception("close failed"))
        await rl.clear()
        assert rl._redis is None




class TestResolveLimit:
    """Tests for _resolve_limit."""

    def test_known_keys(self):
        assert _resolve_limit("upload") > 0
        assert _resolve_limit("chat") > 0
        assert _resolve_limit("summarize") > 0
        assert _resolve_limit("search") > 0
        assert _resolve_limit("users") > 0
        assert _resolve_limit("notes") > 0

    def test_unknown_key_returns_default(self):
        from core.config import settings
        assert _resolve_limit("unknown_endpoint") == settings.RATE_LIMIT_DEFAULT_PER_MINUTE
