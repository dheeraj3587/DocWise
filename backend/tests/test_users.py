"""Tests for user management endpoints."""

import pytest


@pytest.mark.asyncio
class TestUsers:
    """Tests for /api/users endpoints."""

    async def test_create_user(self, client):
        """Test creating a new user."""
        response = await client.post(
            "/api/users",
            json={
                "email": "new@example.com",
                "name": "New User",
                "image_url": "https://example.com/avatar.png",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "created"
        assert data["email"] == "new@example.com"

    async def test_create_user_already_exists(self, client):
        """Test creating a user that already exists returns 'exists'."""
        user_data = {"email": "dup@example.com", "name": "User 1"}

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
        """Test updating a non-existent user."""
        response = await client.patch(
            "/api/users/nobody@example.com",
            json={"name": "Nobody"},
        )
        assert response.status_code == 404

    async def test_update_user_name(self, client):
        """Test updating user name."""
        await client.post(
            "/api/users",
            json={"email": "rename@example.com", "name": "Old Name"},
        )

        response = await client.patch(
            "/api/users/rename@example.com",
            json={"name": "New Name"},
        )
        assert response.status_code == 200

    async def test_create_user_without_image(self, client):
        """Test creating user without image_url."""
        response = await client.post(
            "/api/users",
            json={"email": "noimg@example.com", "name": "No Image"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "created"
