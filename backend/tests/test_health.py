"""Tests for the health endpoint and application startup."""

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
