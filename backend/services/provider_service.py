"""Resilient provider adapters for streamed and non-streamed chat requests."""

from __future__ import annotations

import asyncio
import random
import time
from collections import defaultdict
from typing import Any, AsyncGenerator

import httpx
from openai import AsyncOpenAI

from core.config import settings
from services.model_registry import ChatModel, fallback_chat_model


class ProviderUnavailable(RuntimeError):
    """Raised when all compatible providers are unavailable."""


class ProviderService:
    def __init__(self) -> None:
        self._clients: dict[str, AsyncOpenAI] = {}
        self._failures: dict[str, int] = defaultdict(int)
        self._open_until: dict[str, float] = defaultdict(float)
        self._circuit_lock = asyncio.Lock()

    def _client(self, provider: str) -> AsyncOpenAI:
        existing = self._clients.get(provider)
        if existing is not None:
            return existing

        timeout = httpx.Timeout(
            timeout=settings.CHAT_PROVIDER_TOTAL_TIMEOUT_SECONDS,
            connect=settings.CHAT_PROVIDER_CONNECT_TIMEOUT_SECONDS,
            read=settings.CHAT_PROVIDER_READ_TIMEOUT_SECONDS,
        )
        if provider == "openrouter":
            if not settings.OPENROUTER_API_KEY:
                raise ProviderUnavailable("OpenRouter is not configured")
            headers: dict[str, str] = {}
            if settings.OPENROUTER_HTTP_REFERER:
                headers["HTTP-Referer"] = settings.OPENROUTER_HTTP_REFERER
            if settings.OPENROUTER_APP_TITLE:
                headers["X-Title"] = settings.OPENROUTER_APP_TITLE
            client = AsyncOpenAI(
                api_key=settings.OPENROUTER_API_KEY,
                base_url=settings.OPENROUTER_BASE_URL,
                default_headers=headers,
                timeout=timeout,
                max_retries=0,
            )
        elif provider == "cerebras":
            if not settings.CEREBRAS_API_KEY:
                raise ProviderUnavailable("Cerebras is not configured")
            client = AsyncOpenAI(
                api_key=settings.CEREBRAS_API_KEY,
                base_url=settings.CEREBRAS_BASE_URL,
                default_headers={
                    "X-Cerebras-Version-Patch": settings.CEREBRAS_API_VERSION_PATCH
                },
                timeout=timeout,
                max_retries=0,
            )
        else:
            raise ProviderUnavailable(f"Unsupported provider: {provider}")

        self._clients[provider] = client
        return client

    async def _circuit_available(self, provider: str) -> bool:
        async with self._circuit_lock:
            return time.monotonic() >= self._open_until[provider]

    async def _record_success(self, provider: str) -> None:
        async with self._circuit_lock:
            self._failures[provider] = 0
            self._open_until[provider] = 0.0

    async def _record_failure(self, provider: str) -> None:
        async with self._circuit_lock:
            self._failures[provider] += 1
            if self._failures[provider] >= settings.CHAT_CIRCUIT_FAILURE_THRESHOLD:
                self._open_until[provider] = (
                    time.monotonic() + settings.CHAT_CIRCUIT_RESET_SECONDS
                )

    @staticmethod
    def _is_transient(exc: Exception) -> bool:
        status_code = getattr(exc, "status_code", None)
        if status_code in {408, 409, 425, 429}:
            return True
        if isinstance(status_code, int) and status_code >= 500:
            return True
        return isinstance(exc, (TimeoutError, httpx.TimeoutException, httpx.NetworkError)) or (
            exc.__class__.__name__
            in {"APIConnectionError", "APITimeoutError", "RateLimitError", "InternalServerError"}
        )

    @staticmethod
    def _retry_delay(exc: Exception, attempt: int) -> float:
        response = getattr(exc, "response", None)
        headers = getattr(response, "headers", {}) or {}
        retry_after = headers.get("retry-after") if hasattr(headers, "get") else None
        if retry_after is not None:
            try:
                return max(0.1, min(60.0, float(retry_after)))
            except (TypeError, ValueError):
                pass
        return min(30.0, (2**attempt) + random.uniform(0.05, 0.35))

    @staticmethod
    def _request(
        model: ChatModel,
        messages: list[dict[str, Any]],
        *,
        reasoning: bool,
        stream: bool,
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        request: dict[str, Any] = {
            "model": model["model"],
            "messages": messages,
            "stream": stream,
        }
        if tools:
            request["tools"] = tools
            request["tool_choice"] = "auto"
            request["parallel_tool_calls"] = False
        if model["provider"] == "openrouter":
            if reasoning:
                request["extra_body"] = {
                    "reasoning": {
                        "enabled": True,
                        "effort": model.get("reasoning_effort") or "medium",
                    }
                }
            if stream:
                request["stream_options"] = {"include_usage": True}
        elif reasoning:
            request["reasoning_effort"] = model.get("reasoning_effort") or "high"
        return request

    async def _stream_once(
        self,
        model: ChatModel,
        messages: list[dict[str, Any]],
        *,
        reasoning: bool,
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        request = self._request(
            model,
            messages,
            reasoning=reasoning,
            stream=True,
            tools=tools,
        )
        stream = await self._client(model["provider"]).chat.completions.create(**request)
        usage = {"promptTokens": 0, "completionTokens": 0, "totalTokens": 0}
        tool_calls: dict[int, dict[str, Any]] = {}

        async for chunk in stream:
            if getattr(chunk, "usage", None) is not None:
                usage = {
                    "promptTokens": int(getattr(chunk.usage, "prompt_tokens", 0) or 0),
                    "completionTokens": int(getattr(chunk.usage, "completion_tokens", 0) or 0),
                    "totalTokens": int(getattr(chunk.usage, "total_tokens", 0) or 0),
                }
            delta = chunk.choices[0].delta if chunk.choices else None
            text = getattr(delta, "content", None)
            if text:
                yield {"type": "delta", "text": text}

            for fragment in getattr(delta, "tool_calls", None) or []:
                index = int(getattr(fragment, "index", 0) or 0)
                assembled = tool_calls.setdefault(
                    index,
                    {
                        "id": "",
                        "type": "function",
                        "function": {"name": "", "arguments": ""},
                    },
                )
                fragment_id = getattr(fragment, "id", None)
                if fragment_id and not assembled["id"]:
                    assembled["id"] = str(fragment_id)
                function = getattr(fragment, "function", None)
                function_name = getattr(function, "name", None)
                if function_name and not assembled["function"]["name"]:
                    assembled["function"]["name"] = str(function_name)
                function_arguments = getattr(function, "arguments", None)
                if function_arguments:
                    assembled["function"]["arguments"] += str(function_arguments)

        if tool_calls:
            yield {
                "type": "tool_calls",
                "toolCalls": [tool_calls[index] for index in sorted(tool_calls)],
            }

        yield {"type": "usage", **usage}

    async def stream_chat(
        self,
        model: ChatModel,
        messages: list[dict[str, Any]],
        *,
        reasoning: bool,
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Stream with a bounded retry and one compatible fallback before output."""
        fallback = fallback_chat_model(model, reasoning, require_tools=bool(tools))
        candidates = [(model, False)]
        if fallback and fallback["id"] != model["id"]:
            candidates.append((fallback, True))

        last_error: Exception | None = None
        for candidate, fallback_used in candidates:
            if not await self._circuit_available(candidate["provider"]):
                last_error = ProviderUnavailable(
                    f"{candidate['provider']} circuit is temporarily open"
                )
                continue

            attempts = settings.CHAT_PROVIDER_MAX_RETRIES + 1 if not fallback_used else 1
            for attempt in range(attempts):
                emitted = False
                try:
                    stream_kwargs: dict[str, Any] = {"reasoning": reasoning}
                    if tools:
                        stream_kwargs["tools"] = tools
                    async for event in self._stream_once(
                        candidate, messages, **stream_kwargs
                    ):
                        if event["type"] == "delta":
                            emitted = True
                        yield {
                            **event,
                            "provider": candidate["provider"],
                            "modelId": candidate["id"],
                            "fallbackUsed": fallback_used,
                            "originalProvider": model["provider"],
                        }
                    await self._record_success(candidate["provider"])
                    return
                except Exception as exc:
                    last_error = exc
                    await self._record_failure(candidate["provider"])
                    if emitted:
                        raise ProviderUnavailable(
                            "Chat provider stream was interrupted after output began"
                        ) from exc
                    if not self._is_transient(exc) or attempt + 1 >= attempts:
                        break
                    await asyncio.sleep(self._retry_delay(exc, attempt))

        raise ProviderUnavailable("All compatible chat providers are unavailable") from last_error

    async def complete(
        self,
        model: ChatModel,
        messages: list[dict[str, Any]],
        *,
        reasoning: bool = False,
    ) -> tuple[str, dict[str, Any]]:
        fallback = fallback_chat_model(model, reasoning)
        candidates = [(model, False)]
        if fallback and fallback["id"] != model["id"]:
            candidates.append((fallback, True))

        last_error: Exception | None = None
        for candidate, fallback_used in candidates:
            if not await self._circuit_available(candidate["provider"]):
                continue
            attempts = settings.CHAT_PROVIDER_MAX_RETRIES + 1 if not fallback_used else 1
            for attempt in range(attempts):
                try:
                    request = self._request(candidate, messages, reasoning=reasoning, stream=False)
                    response = await self._client(candidate["provider"]).chat.completions.create(**request)
                    await self._record_success(candidate["provider"])
                    content = response.choices[0].message.content if response.choices else ""
                    usage = getattr(response, "usage", None)
                    return content or "", {
                        "provider": candidate["provider"],
                        "modelId": candidate["id"],
                        "fallbackUsed": fallback_used,
                        "originalProvider": model["provider"],
                        "promptTokens": int(getattr(usage, "prompt_tokens", 0) or 0),
                        "completionTokens": int(getattr(usage, "completion_tokens", 0) or 0),
                        "totalTokens": int(getattr(usage, "total_tokens", 0) or 0),
                    }
                except Exception as exc:
                    last_error = exc
                    await self._record_failure(candidate["provider"])
                    if not self._is_transient(exc) or attempt + 1 >= attempts:
                        break
                    await asyncio.sleep(self._retry_delay(exc, attempt))

        raise ProviderUnavailable("All compatible chat providers are unavailable") from last_error


provider_service = ProviderService()
