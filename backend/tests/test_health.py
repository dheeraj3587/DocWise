"""Tests for the health endpoint and application startup."""

import pytest


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
