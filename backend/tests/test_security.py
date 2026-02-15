"""Tests for core security module."""

from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from core.config import settings
import core.security as security
from core.security import get_current_user, get_optional_user, clear_jwks_cache


@pytest.mark.asyncio
class TestSecurity:
    """Tests for auth/security utilities."""

    async def test_get_current_user_no_token(self):
        """Test that missing token raises 401."""
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(None)
        assert exc_info.value.status_code == 401

    async def test_get_optional_user_no_token(self):
        """Test that optional user returns None when no token."""
        result = await get_optional_user(None)
        assert result is None

    async def test_get_optional_user_invalid_token(self):
        """Test that optional user returns None for invalid token."""
        mock_creds = MagicMock()
        mock_creds.credentials = "invalid-token"

        with patch("core.security._get_jwks", new_callable=AsyncMock) as mock_jwks:
            mock_jwks.return_value = {"keys": []}
            result = await get_optional_user(mock_creds)
            assert result is None

    def test_clear_jwks_cache(self):
        """Test clearing JWKS cache."""
        clear_jwks_cache()
        # Should not raise
        assert security._jwks_cache is None
        assert security._jwks_cache_time == 0.0

    async def test_get_current_user_no_matching_key(self):
        """Test error when no matching signing key found."""
        mock_creds = MagicMock()
        mock_creds.credentials = (
            "eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2V5LWlkIiwidHlwIjoiSldUIn0."
            "eyJzdWIiOiJ1c2VyXzEyMyJ9."
            "fake-signature"
        )

        with patch("core.security._get_jwks", new_callable=AsyncMock) as mock_jwks:
            mock_jwks.return_value = {"keys": []}
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(mock_creds)
            assert exc_info.value.status_code == 401
            assert "signing key" in exc_info.value.detail.lower() or "Unable" in exc_info.value.detail

    async def test_get_current_user_with_valid_api_key(self):
        """Valid API key should authenticate without JWT."""
        original_api_keys = settings.API_KEYS
        settings.API_KEYS = ["test-api-key"]

        result = await get_current_user(None, "test-api-key")

        assert result["auth_type"] == "api_key"
        assert result["sub"].startswith("api_key:")

        settings.API_KEYS = original_api_keys

    async def test_get_current_user_with_invalid_api_key(self):
        """Invalid API key should raise 401."""
        original_api_keys = settings.API_KEYS
        settings.API_KEYS = ["test-api-key"]

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(None, "wrong-key")
        assert exc_info.value.status_code == 401

        settings.API_KEYS = original_api_keys

    def test_verify_api_key_non_string(self):
        """Non-string API keys return None."""
        assert security._verify_api_key(None) is None

    def test_verify_api_key_empty_string(self):
        """Empty API keys return None."""
        assert security._verify_api_key("") is None

    def test_verify_api_key_no_configured_keys(self):
        """No configured keys returns None."""
        original_api_keys = settings.API_KEYS
        settings.API_KEYS = []
        try:
            assert security._verify_api_key("test") is None
        finally:
            settings.API_KEYS = original_api_keys

    @pytest.mark.asyncio
    async def test_get_jwks_cached(self):
        """Cached JWKS returns without HTTP call."""
        import time as _time
        original_cache = security._jwks_cache
        original_cache_time = security._jwks_cache_time
        security._jwks_cache = {"keys": [{"kid": "cached"}]}
        security._jwks_cache_time = _time.time()  # fresh cache
        try:
            result = await security._get_jwks()
            assert result["keys"][0]["kid"] == "cached"
        finally:
            security._jwks_cache = original_cache
            security._jwks_cache_time = original_cache_time

    @pytest.mark.asyncio
    async def test_get_jwks_missing_config(self):
        """Missing JWKS URL raises 503."""
        original = settings.CLERK_JWKS_URL
        original_cache = security._jwks_cache
        original_cache_time = security._jwks_cache_time
        settings.CLERK_JWKS_URL = ""
        security._jwks_cache = None  # ensure no cached value
        security._jwks_cache_time = 0.0
        try:
            with pytest.raises(HTTPException) as exc_info:
                await security._get_jwks()
            assert exc_info.value.status_code == 503
        finally:
            settings.CLERK_JWKS_URL = original
            security._jwks_cache = original_cache
            security._jwks_cache_time = original_cache_time

    @pytest.mark.asyncio
    async def test_get_jwks_fetches_and_caches(self):
        """JWKS fetch populates cache."""
        original_url = settings.CLERK_JWKS_URL
        original_cache = security._jwks_cache
        original_cache_time = security._jwks_cache_time
        settings.CLERK_JWKS_URL = "https://example.com/jwks"
        security._jwks_cache = None
        security._jwks_cache_time = 0.0

        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"keys": [{"kid": "live"}]}

        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp

        cm = AsyncMock()
        cm.__aenter__.return_value = mock_client
        cm.__aexit__.return_value = False

        with patch("core.security.httpx.AsyncClient", return_value=cm):
            result = await security._get_jwks()

        assert result["keys"][0]["kid"] == "live"
        assert security._jwks_cache == result
        assert security._jwks_cache_time > 0

        settings.CLERK_JWKS_URL = original_url
        security._jwks_cache = original_cache
        security._jwks_cache_time = original_cache_time
