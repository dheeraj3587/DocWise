"""Tests for core.cache — CacheService with memory fallback."""

import asyncio
import time
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from core.cache import CacheService


@pytest.mark.asyncio
class TestCacheServiceMemory:
    """Test CacheService using in-memory fallback (no Redis)."""

    async def test_set_and_get(self):
        svc = CacheService()
        svc._redis = None  # force memory path
        with patch.object(svc, "_get_redis", new_callable=AsyncMock, return_value=None):
            await svc.set_json("key1", {"a": 1}, ttl_seconds=60)
            result = await svc.get_json("key1")
        assert result == {"a": 1}

    async def test_get_missing_key(self):
        svc = CacheService()
        svc._redis = None
        with patch.object(svc, "_get_redis", new_callable=AsyncMock, return_value=None):
            result = await svc.get_json("nonexistent")
        assert result is None

    async def test_expired_key_returns_none(self):
        svc = CacheService()
        svc._redis = None
        with patch.object(svc, "_get_redis", new_callable=AsyncMock, return_value=None):
            await svc.set_json("expiring", "val", ttl_seconds=1)

        # Manually expire by setting past time
        async with svc._lock:
            key = "expiring"
            _, payload = svc._memory_cache[key]
            svc._memory_cache[key] = (time.time() - 10, payload)

        with patch.object(svc, "_get_redis", new_callable=AsyncMock, return_value=None):
            result = await svc.get_json("expiring")
        assert result is None

    async def test_clear(self):
        svc = CacheService()
        svc._redis = None
        with patch.object(svc, "_get_redis", new_callable=AsyncMock, return_value=None):
            await svc.set_json("k", "v", ttl_seconds=60)
        await svc.clear()
        with patch.object(svc, "_get_redis", new_callable=AsyncMock, return_value=None):
            assert await svc.get_json("k") is None


@pytest.mark.asyncio
class TestCacheServiceDisabled:
    """Test CacheService when caching is disabled."""

    async def test_get_returns_none_when_disabled(self):
        svc = CacheService()
        with patch("core.cache.settings") as mock_settings:
            mock_settings.CACHE_ENABLED = False
            result = await svc.get_json("anything")
        assert result is None

    async def test_set_is_noop_when_disabled(self):
        svc = CacheService()
        with patch("core.cache.settings") as mock_settings:
            mock_settings.CACHE_ENABLED = False
            await svc.set_json("anything", "val", ttl_seconds=60)
        # No error, memory cache should still be empty
        assert "anything" not in svc._memory_cache


@pytest.mark.asyncio
class TestCacheServiceRedisFailure:
    """Test CacheService falls back to memory when Redis fails."""

    async def test_redis_connection_failure_falls_back(self):
        svc = CacheService()
        svc._redis = None

        mock_redis = AsyncMock()
        mock_redis.ping = AsyncMock(side_effect=ConnectionError("Redis down"))

        with patch("core.cache.settings") as mock_settings:
            mock_settings.CACHE_ENABLED = True
            mock_settings.REDIS_URL = "redis://localhost:6379/15"
            with patch("core.cache.Redis.from_url", return_value=mock_redis):
                redis = await svc._get_redis()

        assert redis is None


@pytest.mark.asyncio
class TestCacheServiceRedis:
    """Test CacheService using a mock Redis client (Redis enabled)."""

    @pytest.mark.asyncio
    async def test_set_and_get_redis(self):
        svc = CacheService()
        mock_redis = AsyncMock()
        mock_redis.get.return_value = b'{"a": 1}'

        with patch.object(svc, "_get_redis", new_callable=AsyncMock, return_value=mock_redis):
            # Test set
            await svc.set_json("key1", {"a": 1}, ttl_seconds=60)
            mock_redis.set.assert_called_with("key1", '{"a": 1}', ex=60)

            # Test get
            result = await svc.get_json("key1")
            assert result == {"a": 1}
            mock_redis.get.assert_called_with("key1")

    @pytest.mark.asyncio
    async def test_get_redis_miss(self):
        svc = CacheService()
        mock_redis = AsyncMock()
        mock_redis.get.return_value = None

        with patch.object(svc, "_get_redis", new_callable=AsyncMock, return_value=mock_redis):
            result = await svc.get_json("missing")
            assert result is None

    @pytest.mark.asyncio
    async def test_clear_redis(self):
        svc = CacheService()
        mock_redis = AsyncMock()
        
        # clear() closes the connection if it exists
        svc._redis = mock_redis
        
        await svc.clear()
        mock_redis.close.assert_called()
        assert svc._redis is None


