"""Tests for core.config — Settings validators."""

import json
import pytest

from core.config import Settings


class TestParseCorOrigins:
    """Tests for Settings.parse_cors_origins validator."""

    def test_list_input_passthrough(self):
        result = Settings.parse_cors_origins(["http://a.com", "http://b.com"])
        assert result == ["http://a.com", "http://b.com"]

    def test_csv_string(self):
        result = Settings.parse_cors_origins("http://a.com, http://b.com")
        assert result == ["http://a.com", "http://b.com"]

    def test_json_array_string(self):
        result = Settings.parse_cors_origins('["http://a.com","http://b.com"]')
        assert result == ["http://a.com", "http://b.com"]

    def test_empty_string(self):
        result = Settings.parse_cors_origins("")
        assert result == []

    def test_single_origin(self):
        result = Settings.parse_cors_origins("http://localhost:3000")
        assert result == ["http://localhost:3000"]

    def test_non_string_non_list(self):
        result = Settings.parse_cors_origins(123)
        assert result == ["http://localhost:3000"]


class TestParseApiKeys:
    """Tests for Settings.parse_api_keys validator."""

    def test_list_input(self):
        result = Settings.parse_api_keys(["key1", "key2"])
        assert result == ["key1", "key2"]

    def test_json_array_string(self):
        result = Settings.parse_api_keys('["key1", "key2"]')
        assert result == ["key1", "key2"]

    def test_csv_string(self):
        result = Settings.parse_api_keys("key1, key2")
        assert result == ["key1", "key2"]

    def test_empty_string(self):
        result = Settings.parse_api_keys("")
        assert result == []

    def test_non_string_non_list(self):
        result = Settings.parse_api_keys(42)
        assert result == []

    def test_strips_whitespace(self):
        result = Settings.parse_api_keys("  key1  ,  key2  ")
        assert result == ["key1", "key2"]

    def test_filters_empty_items(self):
        result = Settings.parse_api_keys(["key1", "", "  ", "key2"])
        assert result == ["key1", "key2"]
