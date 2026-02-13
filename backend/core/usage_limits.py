"""Per-user usage guardrails for LLM cost and streaming concurrency."""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict

from fastapi import HTTPException, status
from redis.asyncio import Redis

from core.config import settings


class UsageLimiter:
    _MAX_MEMORY_ENTRIES = 10000

    def __init__(self):
        self._redis: Redis | None = None
        self._lock = asyncio.Lock()
        self._memory_daily_units: dict[str, tuple[int, float]] = {}
        self._memory_streams: dict[str, int] = defaultdict(int)

    async def _get_redis(self) -> Redis | None:
        if self._redis is not None:
            return self._redis
        try:
            self._redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
            await self._redis.ping()
            return self._redis
        except Exception:
            self._redis = None
            return None

    @staticmethod
    def _day_key(now: float | None = None) -> int:
        timestamp = now if now is not None else time.time()
        return int(timestamp // 86400)

    async def consume_daily_units(self, user_scope: str, endpoint: str, units: int) -> None:
        limit = max(1, settings.LLM_DAILY_BUDGET_UNITS_PER_USER)
        units = max(0, units)
        day = self._day_key()
        key = f"usage:{endpoint}:{user_scope}:{day}"

        redis = await self._get_redis()
        if redis is not None:
            try:
                current = await redis.incrby(key, units)
                if current == units:
                    await redis.expire(key, 86400)
                if int(current) > limit:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Daily usage budget exceeded",
                    )
                return
            except HTTPException:
                raise
            except Exception:
                pass

        now = time.time()
        async with self._lock:
            # Prune expired entries when map grows too large
            if len(self._memory_daily_units) > self._MAX_MEMORY_ENTRIES:
                expired_keys = [
                    k for k, (_, exp) in self._memory_daily_units.items() if now >= exp
                ]
                for k in expired_keys:
                    self._memory_daily_units.pop(k, None)

            current, expires_at = self._memory_daily_units.get(key, (0, 0.0))
            if now >= expires_at:
                current = 0
                expires_at = now + 86400
            current += units
            self._memory_daily_units[key] = (current, expires_at)
            if current > limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Daily usage budget exceeded",
                )

    async def acquire_stream_slot(self, user_scope: str) -> None:
        limit = max(1, settings.LLM_MAX_CONCURRENT_STREAMS_PER_USER)
        key = f"stream:{user_scope}"

        redis = await self._get_redis()
        if redis is not None:
            try:
                current = await redis.incr(key)
                await redis.expire(key, 120)
                if int(current) > limit:
                    await redis.decr(key)
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Too many concurrent streams",
                    )
                return
            except HTTPException:
                raise
            except Exception:
                pass

        async with self._lock:
            current = self._memory_streams.get(key, 0) + 1
            if current > limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many concurrent streams",
                )
            self._memory_streams[key] = current

    async def release_stream_slot(self, user_scope: str) -> None:
        key = f"stream:{user_scope}"
        redis = await self._get_redis()
        if redis is not None:
            try:
                current = await redis.decr(key)
                if int(current) <= 0:
                    await redis.delete(key)
                return
            except Exception:
                pass

        async with self._lock:
            current = self._memory_streams.get(key, 0)
            if current <= 1:
                self._memory_streams.pop(key, None)
            else:
                self._memory_streams[key] = current - 1


usage_limiter = UsageLimiter()
