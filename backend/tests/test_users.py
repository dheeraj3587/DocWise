"""Tests for user management endpoints."""

import pytest


@pytest.mark.asyncio
class TestUsers:
    """Tests for /api/users endpoints."""

    async def test_create_user(self, client):
        """Test creating a new user (must match authenticated email)."""
        response = await client.post(
            "/api/users",
            json={
                "email": "test@example.com",
                "name": "Test User",
                "image_url": "https://example.com/avatar.png",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "created"
        assert data["email"] == "test@example.com"

    async def test_create_user_forbidden_for_other_email(self, client):
        """Test that creating a profile for another email is rejected."""
        response = await client.post(
            "/api/users",
            json={
                "email": "other@example.com",
                "name": "Other User",
            },
        )
        assert response.status_code == 403
        assert "own profile" in response.json()["detail"].lower()

    async def test_create_user_already_exists(self, client):
        """Test creating a user that already exists returns 'exists'."""
        user_data = {"email": "test@example.com", "name": "Test User"}

        # Create first
        await client.post("/api/users", json=user_data)

        # Create again
        response = await client.post("/api/users", json=user_data)
        assert response.status_code == 200
        assert response.json()["status"] == "exists"

    async def test_get_me(self, client):
        """Test getting current user profile."""
        # Create user first
        await client.post(
            "/api/users",
            json={"email": "test@example.com", "name": "Test User"},
        )

        response = await client.get("/api/users/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"

    async def test_get_me_no_db_record(self, client):
        """Test getting profile when user not in DB yet (returns auth data)."""
        response = await client.get("/api/users/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"

    async def test_update_user_not_found(self, client):
        """Test updating own profile when no DB record exists returns 404."""
        response = await client.patch(
            "/api/users/test@example.com",
            json={"name": "New Name"},
        )
        assert response.status_code == 404

    async def test_update_user_forbidden_for_other_email(self, client):
        """Test that updating another user's profile is rejected."""
        response = await client.patch(
            "/api/users/other@example.com",
            json={"name": "Hacked"},
        )
        assert response.status_code == 403
        assert "own profile" in response.json()["detail"].lower()

    async def test_update_user_name(self, client):
        """Test updating user name."""
        await client.post(
            "/api/users",
            json={"email": "test@example.com", "name": "Old Name"},
        )

        response = await client.patch(
            "/api/users/test@example.com",
            json={"name": "New Name"},
        )
        assert response.status_code == 200

    async def test_create_user_without_image(self, client):
        """Test creating user without image_url."""
        response = await client.post(
            "/api/users",
            json={"email": "test@example.com", "name": "No Image"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "created"

    async def test_update_user_image(self, client):
        """Test updating user image URL."""
        await client.post(
            "/api/users",
            json={"email": "test@example.com", "name": "Img User"},
        )

        response = await client.patch(
            "/api/users/test@example.com",
            json={"image_url": "https://new.com/pic.jpg"},
        )
        assert response.status_code == 200
