"""Structured request logging and Prometheus metrics for DocWise."""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any

from prometheus_client import Counter, Gauge, Histogram
from starlette.middleware.base import BaseHTTPMiddleware


logger = logging.getLogger("docwise.events")

HTTP_REQUESTS = Counter(
    "docwise_http_requests_total",
    "HTTP requests handled by the API",
    ("method", "route", "status"),
)
HTTP_LATENCY = Histogram(
    "docwise_http_request_duration_seconds",
    "HTTP request latency",
    ("method", "route"),
)
CHAT_FIRST_TOKEN = Histogram(
    "docwise_chat_first_token_seconds",
    "Time from chat execution to the first provider token",
    ("provider", "model"),
)
RETRIEVAL_LATENCY = Histogram(
    "docwise_retrieval_duration_seconds",
    "Hybrid document retrieval latency",
)
PROVIDER_ERRORS = Counter(
    "docwise_provider_errors_total",
    "Chat provider failures",
    ("provider", "code"),
)
PROVIDER_FALLBACKS = Counter(
    "docwise_provider_fallbacks_total",
    "Completed chat fallbacks",
    ("original_provider", "final_provider"),
)
INVALID_CITATIONS = Counter(
    "docwise_invalid_citations_total",
    "Answers requiring citation repair",
)
AGENT_RUNS = Counter(
    "docwise_agent_runs_total",
    "Bounded agent runs by final status",
    ("status",),
)
AGENT_ITERATIONS = Histogram(
    "docwise_agent_iterations",
    "Model iterations used by bounded agent turns",
    buckets=(1, 2, 3, 4, 5, 6),
)
AGENT_TOOL_CALLS = Counter(
    "docwise_agent_tool_calls_total",
    "Allowlisted agent tool calls by tool and status",
    ("tool", "status"),
)
AGENT_TOOL_LATENCY = Histogram(
    "docwise_agent_tool_duration_seconds",
    "Allowlisted agent tool execution duration",
    ("tool",),
)
JOB_RETRIES = Counter(
    "docwise_processing_job_retries_total",
    "Document processing retries",
    ("kind",),
)
OUTBOX_QUEUE_DEPTH = Gauge(
    "docwise_outbox_pending",
    "Pending durable outbox events",
)
STUCK_JOBS = Gauge(
    "docwise_processing_jobs_stuck",
    "Processing jobs found stale by the watchdog",
)


def log_event(event: str, **fields: Any) -> None:
    payload = {"event": event, **{key: value for key, value in fields.items() if value is not None}}
    logger.info(json.dumps(payload, default=str, separators=(",", ":")))


class RequestObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            route = getattr(request.scope.get("route"), "path", request.url.path)
            elapsed = time.perf_counter() - started
            HTTP_REQUESTS.labels(request.method, route, str(status_code)).inc()
            HTTP_LATENCY.labels(request.method, route).observe(elapsed)
            log_event(
                "http.request.completed",
                request_id=request_id,
                method=request.method,
                route=route,
                status=status_code,
                duration_ms=round(elapsed * 1000, 2),
            )
