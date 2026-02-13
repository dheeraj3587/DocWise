"""Tests for core security module."""

from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from core.config import settings
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
        from core.security import _jwks_cache
        assert _jwks_cache is None

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
