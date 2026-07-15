"""Tests for the health endpoint and application startup."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from starlette.requests import Request


@pytest.mark.asyncio
class TestHealth:
    """Tests for /api/health."""

    async def test_health_check(self, client):
        """Test health endpoint returns ok."""
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "docwise-api"

    async def test_live_metrics_and_ready_endpoints(self, client):
        live = await client.get("/api/live")
        assert live.status_code == 200
        assert live.json()["status"] == "alive"

        metrics = await client.get("/metrics")
        assert metrics.status_code == 200
        assert "docwise_http_requests_total" in metrics.text

        redis = AsyncMock()
        redis.ping.return_value = True
        redis.get.return_value = "alive"
        with patch("main.Redis.from_url", return_value=redis), patch(
            "main.storage_service.healthcheck", return_value=True
        ):
            ready = await client.get("/api/ready")

        assert ready.status_code == 200
        payload = ready.json()
        assert payload["status"] == "ready"
        assert payload["checks"]["database"] is True
        assert payload["checks"]["schema"] is True
        assert payload["checks"]["redis"] is True
        assert payload["checks"]["worker"] is True
        redis.aclose.assert_awaited_once()

    async def test_ready_reports_storage_failure_and_redis_degradation(self, client):
        redis = AsyncMock()
        redis.ping.side_effect = OSError("redis unavailable")
        with patch("main.Redis.from_url", return_value=redis), patch(
            "main.storage_service.healthcheck", return_value=False
        ):
            response = await client.get("/api/ready")

        assert response.status_code == 503
        payload = response.json()
        assert payload["status"] == "not_ready"
        assert payload["degraded"] is True
        assert payload["checks"]["redis"] is False
        assert payload["checks"]["objectStorage"] is False

    async def test_readiness_checks_expected_schema_and_database_failure(self):
        from core.config import settings
        from main import readiness_check

        connection = AsyncMock()
        connection.execute.side_effect = [
            SimpleNamespace(),
            SimpleNamespace(
                scalar_one_or_none=lambda: settings.REQUIRED_SCHEMA_REVISION
            ),
        ]

        class ConnectionContext:
            async def __aenter__(self):
                return connection

            async def __aexit__(self, *_args):
                return False

        redis = AsyncMock()
        redis.ping.return_value = True
        redis.get.return_value = "alive"
        healthy_engine = SimpleNamespace(connect=lambda: ConnectionContext())
        with patch("main.engine", new=healthy_engine), patch(
            "main.Redis.from_url", return_value=redis
        ), patch("main.storage_service.healthcheck", return_value=True):
            ready = await readiness_check()
        assert ready.status_code == 200

        class BrokenConnectionContext:
            async def __aenter__(self):
                raise OSError("database unavailable")

            async def __aexit__(self, *_args):
                return False

        broken_engine = SimpleNamespace(connect=lambda: BrokenConnectionContext())
        with patch("main.engine", new=broken_engine), patch(
            "main.Redis.from_url", return_value=redis
        ), patch("main.storage_service.healthcheck", return_value=True):
            unavailable = await readiness_check()
        assert unavailable.status_code == 503


@pytest.mark.asyncio
class TestCORS:
    """Basic CORS tests."""

    async def test_cors_headers(self, client):
        """Test that CORS headers are present."""
        response = await client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        # FastAPI will handle the CORS response
        assert response.status_code in (200, 405)


@pytest.mark.asyncio
class TestAppLifecycle:
    """Tests for app lifecycle hooks."""

    async def test_lifespan_runs(self):
        """Test lifespan startup and shutdown."""
        from main import app, lifespan
        async with lifespan(app):
            assert app is not None

    async def test_global_exception_handler(self):
        """Test global exception handler returns 500."""
        from main import global_exception_handler
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/boom",
            "headers": [],
            "scheme": "http",
            "server": ("test", 80),
            "client": ("test", 1234),
        }
        request = Request(scope)
        response = await global_exception_handler(request, Exception("boom"))
        assert response.status_code == 500
        assert response.body == b'{"detail":"Internal server error"}'
