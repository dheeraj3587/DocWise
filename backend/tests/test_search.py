"""Tests for vector search endpoint."""

import uuid
from unittest.mock import MagicMock, patch

import pytest

from core.cache import cache_service
from core.config import settings
from core.rate_limit import rate_limiter


@pytest.mark.asyncio
class TestSearch:
    """Tests for /api/search endpoints."""

    async def test_search_documents(self, client, mock_embedding_service, create_owned_file):
        """Test searching for similar chunks."""
        file_id = await create_owned_file()

        response = await client.post(
            "/api/search",
            json={"query": "machine learning", "file_id": file_id, "top_k": 3},
        )

        assert response.status_code == 200
        results = response.json()
        assert isinstance(results, list)
        assert len(results) > 0
        assert "text" in results[0]
        assert "score" in results[0]

    async def test_search_empty_query(self, client, mock_embedding_service, create_owned_file):
        """Test search with empty query returns empty."""
        mock_embedding_service.search_similar = MagicMock(return_value=[])
        file_id = await create_owned_file()

        response = await client.post(
            "/api/search",
            json={"query": "", "file_id": file_id},
        )

        assert response.status_code == 200
        assert response.json() == []

    async def test_search_with_timestamps(self, client, create_owned_file):
        """Test search results include timestamps for media files."""
        file_id = await create_owned_file(file_type="audio", file_name="test.mp3")

        with patch("routers.search.embedding_service") as mock:
            mock.search_similar = MagicMock(
                return_value=[
                    {
                        "text": "discussion about AI",
                        "score": 0.8,
                        "start_time": 30.0,
                        "end_time": 45.5,
                        "file_id": file_id,
                    }
                ]
            )

            response = await client.post(
                "/api/search",
                json={"query": "AI discussion", "file_id": file_id},
            )

            results = response.json()
            assert results[0]["startTime"] == 30.0
            assert results[0]["endTime"] == 45.5

    async def test_search_default_top_k(self, client, mock_embedding_service, create_owned_file):
        """Test search with default top_k value."""
        file_id = await create_owned_file()
        response = await client.post(
            "/api/search",
            json={"query": "test", "file_id": file_id},
        )
        assert response.status_code == 200

    async def test_search_missing_fields(self, client):
        """Test search with missing required fields."""
        response = await client.post("/api/search", json={})
        assert response.status_code == 422

    async def test_search_file_not_found(self, client):
        """Test search with non-existent file returns 404."""
        with patch("routers.search.embedding_service") as mock:
            mock.search_similar = MagicMock(return_value=[])

            response = await client.post(
                "/api/search",
                json={"query": "test", "file_id": str(uuid.uuid4())},
            )
            assert response.status_code == 404

    async def test_search_no_results(self, client, create_owned_file):
        """Test search returning no results."""
        file_id = await create_owned_file()
        with patch("routers.search.embedding_service") as mock:
            mock.search_similar = MagicMock(return_value=[])

            response = await client.post(
                "/api/search",
                json={"query": "nonexistent topic", "file_id": file_id},
            )
            assert response.status_code == 200
            assert response.json() == []

    async def test_search_uses_cache_for_identical_query(self, client, create_owned_file):
        """Repeated identical search should hit cache on second request."""
        file_id = await create_owned_file()

        with patch("routers.search.embedding_service") as mock:
            mock.search_similar = MagicMock(
                return_value=[{"text": "cached result", "score": 0.9, "file_id": file_id}]
            )

            first = await client.post(
                "/api/search",
                json={"query": "cache me", "file_id": file_id, "top_k": 5},
            )
            second = await client.post(
                "/api/search",
                json={"query": "cache me", "file_id": file_id, "top_k": 5},
            )

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json() == second.json()
        assert mock.search_similar.call_count == 1

    async def test_search_rate_limited_after_limit(self, client, create_owned_file):
        """Requests beyond configured limit should return 429."""
        file_id = await create_owned_file()

        original_limit = settings.RATE_LIMIT_SEARCH_PER_MINUTE
        settings.RATE_LIMIT_SEARCH_PER_MINUTE = 1
        await cache_service.clear()
        await rate_limiter.clear()

        with patch("routers.search.embedding_service") as mock:
            mock.search_similar = MagicMock(
                return_value=[{"text": "result", "score": 0.8, "file_id": file_id}]
            )

            first = await client.post(
                "/api/search",
                json={"query": "limit me", "file_id": file_id, "top_k": 1},
            )
            second = await client.post(
                "/api/search",
                json={"query": "limit me again", "file_id": file_id, "top_k": 1},
            )

        settings.RATE_LIMIT_SEARCH_PER_MINUTE = original_limit

        assert first.status_code == 200
        assert second.status_code == 429
