"""Caching utilities backed by Redis with safe in-memory fallback."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from redis.asyncio import Redis

from core.config import settings


class CacheService:
    """Provides JSON cache operations with TTL."""

    def __init__(self):
        self._redis: Redis | None = None
        self._memory_cache: dict[str, tuple[float, str]] = {}
        self._lock = asyncio.Lock()

    async def _get_redis(self) -> Redis | None:
        if not settings.CACHE_ENABLED:
            return None

        if self._redis is not None:
            return self._redis

        try:
            self._redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
            await self._redis.ping()
            return self._redis
        except Exception:
            self._redis = None
            return None

    async def get_json(self, key: str) -> Any | None:
        if not settings.CACHE_ENABLED:
            return None

        redis = await self._get_redis()
        if redis is not None:
            try:
                payload = await redis.get(key)
                if payload is None:
                    return None
                return json.loads(payload)
            except Exception:
                pass

        async with self._lock:
            item = self._memory_cache.get(key)
            if not item:
                return None
            expires_at, payload = item
            if expires_at <= time.time():
                self._memory_cache.pop(key, None)
                return None
            return json.loads(payload)

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        if not settings.CACHE_ENABLED:
            return

        payload = json.dumps(value)
        redis = await self._get_redis()
        if redis is not None:
            try:
                await redis.set(key, payload, ex=ttl_seconds)
                return
            except Exception:
                pass

        async with self._lock:
            self._memory_cache[key] = (time.time() + ttl_seconds, payload)

    async def clear(self) -> None:
        async with self._lock:
            self._memory_cache.clear()

        if self._redis is not None:
            try:
                await self._redis.close()
            except Exception:
                pass
            self._redis = None


cache_service = CacheService()
