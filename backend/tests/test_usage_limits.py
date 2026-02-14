"""Tests for core.usage_limits — UsageLimiter."""

import time
from unittest.mock import patch, AsyncMock

import pytest
from fastapi import HTTPException

from core.usage_limits import UsageLimiter


@pytest.mark.asyncio
class TestUsageLimiterDailyUnits:
    """Tests for consume_daily_units (memory path)."""

    async def test_within_budget(self):
        ul = UsageLimiter()
        with patch.object(ul, "_get_redis", new_callable=AsyncMock, return_value=None):
            # Should not raise
            await ul.consume_daily_units("user:test", "chat", 10)

    async def test_exceeds_budget_raises_429(self):
        ul = UsageLimiter()
        with patch.object(ul, "_get_redis", new_callable=AsyncMock, return_value=None):
            with patch("core.usage_limits.settings") as mock_settings:
                mock_settings.LLM_DAILY_BUDGET_UNITS_PER_USER = 5
                mock_settings.REDIS_URL = "redis://localhost:6379/15"
                with pytest.raises(HTTPException) as exc:
                    await ul.consume_daily_units("user:test2", "chat", 10)
                assert exc.value.status_code == 429

    async def test_cumulative_exceeds_budget(self):
        ul = UsageLimiter()
        with patch.object(ul, "_get_redis", new_callable=AsyncMock, return_value=None):
            with patch("core.usage_limits.settings") as mock_settings:
                mock_settings.LLM_DAILY_BUDGET_UNITS_PER_USER = 10
                mock_settings.REDIS_URL = "redis://localhost:6379/15"
                await ul.consume_daily_units("user:test3", "chat", 6)
                with pytest.raises(HTTPException) as exc:
                    await ul.consume_daily_units("user:test3", "chat", 6)
                assert exc.value.status_code == 429


@pytest.mark.asyncio
class TestUsageLimiterStreams:
    """Tests for acquire/release stream slots (memory path)."""

    async def test_acquire_within_limit(self):
        ul = UsageLimiter()
        with patch.object(ul, "_get_redis", new_callable=AsyncMock, return_value=None):
            with patch("core.usage_limits.settings") as mock_settings:
                mock_settings.LLM_MAX_CONCURRENT_STREAMS_PER_USER = 3
                mock_settings.REDIS_URL = "redis://localhost:6379/15"
                await ul.acquire_stream_slot("user:test")

    async def test_acquire_over_limit_raises_429(self):
        ul = UsageLimiter()
        with patch.object(ul, "_get_redis", new_callable=AsyncMock, return_value=None):
            with patch("core.usage_limits.settings") as mock_settings:
                mock_settings.LLM_MAX_CONCURRENT_STREAMS_PER_USER = 1
                mock_settings.REDIS_URL = "redis://localhost:6379/15"
                await ul.acquire_stream_slot("user:test4")
                with pytest.raises(HTTPException) as exc:
                    await ul.acquire_stream_slot("user:test4")
                assert exc.value.status_code == 429

    async def test_release_slot(self):
        ul = UsageLimiter()
        with patch.object(ul, "_get_redis", new_callable=AsyncMock, return_value=None):
            with patch("core.usage_limits.settings") as mock_settings:
                mock_settings.LLM_MAX_CONCURRENT_STREAMS_PER_USER = 1
                mock_settings.REDIS_URL = "redis://localhost:6379/15"
                await ul.acquire_stream_slot("user:test5")
                await ul.release_stream_slot("user:test5")
                # Should be able to acquire again
                await ul.acquire_stream_slot("user:test5")

    async def test_release_when_zero(self):
        ul = UsageLimiter()
        with patch.object(ul, "_get_redis", new_callable=AsyncMock, return_value=None):
            # Release without acquire should not error
            await ul.release_stream_slot("user:nobody")


@pytest.mark.asyncio
class TestUsageLimiterRedis:
    """Tests for UsageLimiter with mock Redis."""

    @pytest.mark.asyncio
    async def test_consume_daily_units_redis(self):
        ul = UsageLimiter()
        mock_redis = AsyncMock()
        # incrby returns new total
        mock_redis.incrby.return_value = 5

        with patch.object(ul, "_get_redis", new_callable=AsyncMock, return_value=mock_redis):
            with patch("core.usage_limits.settings") as mock_settings:
                mock_settings.LLM_DAILY_BUDGET_UNITS_PER_USER = 10
                mock_settings.REDIS_URL = "redis://host"
                
                # Should pass
                await ul.consume_daily_units("user", "chat", 1)
        
        mock_redis.incrby.assert_called()

    @pytest.mark.asyncio
    async def test_consume_daily_units_redis_exceeded(self):
        ul = UsageLimiter()
        mock_redis = AsyncMock()
        # Usage 11 > Limit 10
        mock_redis.incrby.return_value = 11

        with patch.object(ul, "_get_redis", new_callable=AsyncMock, return_value=mock_redis):
            with patch("core.usage_limits.settings") as mock_settings:
                mock_settings.LLM_DAILY_BUDGET_UNITS_PER_USER = 10
                mock_settings.REDIS_URL = "redis://host"

                with pytest.raises(HTTPException) as exc:
                    await ul.consume_daily_units("user", "chat", 1)
                assert exc.value.status_code == 429

    @pytest.mark.asyncio
    async def test_acquire_stream_slot_redis(self):
        ul = UsageLimiter()
        mock_redis = AsyncMock()
        # get returns current count
        mock_redis.get.return_value = b"0"
        mock_redis.incr.return_value = 1

        with patch.object(ul, "_get_redis", new_callable=AsyncMock, return_value=mock_redis):
            with patch("core.usage_limits.settings") as mock_settings:
                mock_settings.LLM_MAX_CONCURRENT_STREAMS_PER_USER = 2
                mock_settings.REDIS_URL = "redis://host"
                
                await ul.acquire_stream_slot("user")
        
        mock_redis.incr.assert_called()

    @pytest.mark.asyncio
    async def test_release_stream_slot_redis(self):
        ul = UsageLimiter()
        mock_redis = AsyncMock()

        with patch.object(ul, "_get_redis", new_callable=AsyncMock, return_value=mock_redis):
             await ul.release_stream_slot("user")
        
        mock_redis.decr.assert_called()

    @pytest.mark.asyncio
    async def test_get_redis_returns_existing(self):
        ul = UsageLimiter()
        mock_redis = AsyncMock()
        ul._redis = mock_redis
        result = await ul._get_redis()
        assert result is mock_redis

    @pytest.mark.asyncio
    async def test_get_redis_failure_returns_none(self):
        ul = UsageLimiter()
        with patch("core.usage_limits.Redis.from_url", side_effect=Exception("down")):
            result = await ul._get_redis()
        assert result is None




class TestDayKey:
    """Tests for _day_key static method."""

    def test_deterministic(self):
        now = 1700000000.0
        key1 = UsageLimiter._day_key(now)
        key2 = UsageLimiter._day_key(now)
        assert key1 == key2
        assert isinstance(key1, int)

    def test_different_days(self):
        key1 = UsageLimiter._day_key(1700000000.0)
        key2 = UsageLimiter._day_key(1700000000.0 + 86400)
        assert key1 != key2
