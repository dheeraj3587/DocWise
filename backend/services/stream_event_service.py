"""Short-lived replay buffer for typed server-sent events."""

from __future__ import annotations

import asyncio
import json
import time
from collections import defaultdict
from typing import Any

from redis.asyncio import Redis

from core.config import settings


class StreamEventService:
    def __init__(self) -> None:
        self._redis: Redis | None = None
        self._memory: dict[str, tuple[float, list[dict[str, Any]]]] = defaultdict(
            lambda: (0.0, [])
        )
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

    async def append(self, message_id: str, event: dict[str, Any]) -> None:
        key = f"chat:events:{message_id}"
        redis = await self._get_redis()
        if redis is not None:
            try:
                await redis.rpush(key, json.dumps(event))
                await redis.expire(key, settings.STREAM_EVENT_TTL_SECONDS)
                return
            except Exception:
                self._redis = None

        async with self._lock:
            _, events = self._memory[key]
            events.append(event)
            self._memory[key] = (
                time.time() + settings.STREAM_EVENT_TTL_SECONDS,
                events[-1000:],
            )

    async def after(self, message_id: str, event_id: int) -> list[dict[str, Any]]:
        key = f"chat:events:{message_id}"
        redis = await self._get_redis()
        if redis is not None:
            try:
                payloads = await redis.lrange(key, 0, -1)
                return [
                    event
                    for event in (json.loads(payload) for payload in payloads)
                    if int(event.get("id", 0)) > event_id
                ]
            except Exception:
                self._redis = None

        async with self._lock:
            expires_at, events = self._memory.get(key, (0.0, []))
            if expires_at <= time.time():
                self._memory.pop(key, None)
                return []
            return [event for event in events if int(event.get("id", 0)) > event_id]


stream_event_service = StreamEventService()
