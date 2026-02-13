"""Rate limiting dependency utilities."""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict

from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis

from core.config import settings
from core.security import get_current_user


class RateLimiter:
    """Per-identity fixed-window limiter using Redis with memory fallback."""

    def __init__(self):
        self._redis: Redis | None = None
        self._memory_counts: dict[str, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
        self._lock = asyncio.Lock()

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

    async def hit(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        redis = await self._get_redis()
        if redis is not None:
            try:
                current = await redis.incr(key)
                if current == 1:
                    await redis.expire(key, window_seconds)
                remaining = max(0, limit - int(current))
                return int(current) <= limit, remaining
            except Exception:
                pass

        now = time.time()
        async with self._lock:
            current, expires_at = self._memory_counts.get(key, (0, 0.0))
            if now >= expires_at:
                current = 0
                expires_at = now + window_seconds

            current += 1
            self._memory_counts[key] = (current, expires_at)
            remaining = max(0, limit - current)
            return current <= limit, remaining

    async def clear(self) -> None:
        async with self._lock:
            self._memory_counts.clear()

        if self._redis is not None:
            try:
                await self._redis.close()
            except Exception:
                pass
            self._redis = None


rate_limiter = RateLimiter()


def _resolve_limit(endpoint_key: str) -> int:
    per_minute_limits = {
        "default": settings.RATE_LIMIT_DEFAULT_PER_MINUTE,
        "upload": settings.RATE_LIMIT_UPLOAD_PER_MINUTE,
        "chat": settings.RATE_LIMIT_CHAT_PER_MINUTE,
        "summarize": settings.RATE_LIMIT_SUMMARIZE_PER_MINUTE,
        "search": settings.RATE_LIMIT_SEARCH_PER_MINUTE,
        "users": settings.RATE_LIMIT_USERS_PER_MINUTE,
        "notes": settings.RATE_LIMIT_NOTES_PER_MINUTE,
    }
    return per_minute_limits.get(endpoint_key, settings.RATE_LIMIT_DEFAULT_PER_MINUTE)


def rate_limit(endpoint_key: str):
    """FastAPI dependency factory for per-endpoint rate limiting."""

    async def _dependency(
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        identity = user.get("email") or user.get("sub") or request.client.host
        limit = _resolve_limit(endpoint_key)
        window_seconds = 60
        bucket = int(time.time() // window_seconds)
        key = f"ratelimit:{endpoint_key}:{identity}:{bucket}"

        allowed, remaining = await rate_limiter.hit(key, limit=limit, window_seconds=window_seconds)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please retry later.",
                headers={
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": str(remaining),
                    "Retry-After": str(window_seconds),
                },
            )

    return _dependency
