"""Small provider-neutral Tavily adapter for bounded agent research."""

from __future__ import annotations

from typing import Any

import httpx

from core.config import settings


class TavilyUnavailable(RuntimeError):
    """Raised when Tavily is unavailable or not configured."""


class TavilyService:
    def _headers(self) -> dict[str, str]:
        if not settings.TAVILY_API_KEY:
            raise TavilyUnavailable("Web search is not configured")
        return {
            "Authorization": f"Bearer {settings.TAVILY_API_KEY}",
            "Content-Type": "application/json",
        }

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        timeout = httpx.Timeout(settings.TAVILY_TIMEOUT_SECONDS)
        try:
            async with httpx.AsyncClient(
                base_url=settings.TAVILY_BASE_URL.rstrip("/"),
                timeout=timeout,
                headers=self._headers(),
            ) as client:
                response = await client.post(path, json=payload)
                response.raise_for_status()
                data = response.json()
                return data if isinstance(data, dict) else {}
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status == 401:
                detail = "Web search credentials were rejected"
            elif status == 429:
                detail = "Web search rate limit reached"
            elif status >= 500:
                detail = "Web search is temporarily unavailable"
            else:
                detail = f"Web search request failed with status {status}"
            raise TavilyUnavailable(detail) from exc
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise TavilyUnavailable("Web search timed out") from exc
        except ValueError as exc:
            raise TavilyUnavailable("Web search returned an invalid response") from exc

    async def search(
        self,
        query: str,
        *,
        max_results: int,
        time_range: str | None = None,
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {
            "query": query,
            "search_depth": "basic",
            "max_results": min(max(1, max_results), settings.TAVILY_MAX_RESULTS),
            "include_answer": False,
            "include_raw_content": False,
            "include_images": False,
        }
        if time_range:
            payload["time_range"] = time_range
        data = await self._post("/search", payload)
        results: list[dict[str, Any]] = []
        for index, item in enumerate(data.get("results") or [], start=1):
            if not isinstance(item, dict):
                continue
            url = str(item.get("url") or "").strip()
            if not url.startswith(("https://", "http://")):
                continue
            results.append(
                {
                    "url": url,
                    "title": str(item.get("title") or url)[:500],
                    "text": str(item.get("content") or "").strip(),
                    "score": float(item.get("score") or 0.0),
                    "published_at": item.get("published_date"),
                    "rank": index,
                }
            )
        return results

    async def extract(self, url: str, *, query: str | None = None) -> str:
        payload: dict[str, Any] = {
            "urls": [url],
            "extract_depth": "basic",
            "format": "markdown",
            "include_images": False,
            "timeout": min(60.0, settings.TAVILY_TIMEOUT_SECONDS),
        }
        if query:
            payload["query"] = query
            payload["chunks_per_source"] = 3
        data = await self._post("/extract", payload)
        for item in data.get("results") or []:
            if isinstance(item, dict) and str(item.get("url") or "") == url:
                return str(item.get("raw_content") or "").strip()
        raise TavilyUnavailable("The selected web source could not be extracted")


tavily_service = TavilyService()
