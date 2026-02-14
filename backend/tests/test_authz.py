"""Tests for core.authz — authorization helpers."""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from core.authz import get_user_scope, get_owner_scopes, assert_file_owner


class TestGetUserScope:
    """Tests for get_user_scope."""

    def test_email_present(self):
        user = {"email": "test@example.com", "sub": "user_123"}
        assert get_user_scope(user) == "email:test@example.com"

    def test_email_empty_falls_back_to_sub(self):
        user = {"email": "", "sub": "user_123"}
        assert get_user_scope(user) == "sub:user_123"

    def test_no_email_uses_sub(self):
        user = {"sub": "user_123"}
        assert get_user_scope(user) == "sub:user_123"

    def test_neither_email_nor_sub_raises(self):
        user = {"email": "", "sub": ""}
        with pytest.raises(HTTPException) as exc:
            get_user_scope(user)
        assert exc.value.status_code == 401

    def test_none_values_raises(self):
        user = {}
        with pytest.raises(HTTPException) as exc:
            get_user_scope(user)
        assert exc.value.status_code == 401


class TestGetOwnerScopes:
    """Tests for get_owner_scopes."""

    def test_with_email_and_sub(self):
        user = {"email": "Test@Example.com", "sub": "user_123"}
        scopes = get_owner_scopes(user)
        assert "email:test@example.com" in scopes
        assert "test@example.com" in scopes
        assert "sub:user_123" in scopes
        assert "user_123" in scopes

    def test_email_only(self):
        user = {"email": "test@example.com"}
        scopes = get_owner_scopes(user)
        assert "email:test@example.com" in scopes
        assert "test@example.com" in scopes

    def test_sub_only(self):
        user = {"email": "", "sub": "user_123"}
        scopes = get_owner_scopes(user)
        assert "sub:user_123" in scopes
        assert "user_123" in scopes


class TestAssertFileOwner:
    """Tests for assert_file_owner."""

    def test_matching_email(self):
        file_record = MagicMock()
        file_record.created_by = "test@example.com"
        user = {"email": "test@example.com", "sub": "user_123"}
        # Should not raise
        assert_file_owner(file_record, user)

    def test_matching_sub(self):
        file_record = MagicMock()
        file_record.created_by = "user_123"
        user = {"email": "", "sub": "user_123"}
        assert_file_owner(file_record, user)

    def test_mismatch_raises_403(self):
        file_record = MagicMock()
        file_record.created_by = "other@example.com"
        user = {"email": "test@example.com", "sub": "user_123"}
        with pytest.raises(HTTPException) as exc:
            assert_file_owner(file_record, user)
        assert exc.value.status_code == 403

    def test_empty_owner_raises_403(self):
        file_record = MagicMock()
        file_record.created_by = ""
        user = {"email": "test@example.com", "sub": "user_123"}
        with pytest.raises(HTTPException) as exc:
            assert_file_owner(file_record, user)
        assert exc.value.status_code == 403

    def test_none_owner_raises_403(self):
        file_record = MagicMock()
        file_record.created_by = None
        user = {"email": "test@example.com", "sub": "user_123"}
        with pytest.raises(HTTPException) as exc:
            assert_file_owner(file_record, user)
        assert exc.value.status_code == 403
