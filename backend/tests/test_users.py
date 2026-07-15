"""Tests for user management endpoints."""

import uuid

import pytest
from sqlalchemy import select

from core.config import settings
from models.conversation import OutboxEvent, ProcessingJob
from models.file import File
from routers.users import _claim_and_queue_legacy_files
from tests.conftest import MOCK_USER, test_session_factory


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

        await client.post("/api/users", json=user_data)

        response = await client.post("/api/users", json=user_data)
        assert response.status_code == 200
        assert response.json()["status"] == "exists"

    async def test_get_me(self, client):
        """Test getting current user profile."""
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

    async def test_first_sign_in_claims_and_queues_legacy_files(self, client):
        file_id = uuid.uuid4()
        async with test_session_factory() as db:
            db.add(
                File(
                    file_id=file_id,
                    file_name="legacy.pdf",
                    file_type="pdf",
                    storage_key="pdf/legacy.pdf",
                    created_by=MOCK_USER["email"],
                    owner_sub=None,
                    status="ready",
                )
            )
            await db.commit()

        async with test_session_factory() as db:
            assert await _claim_and_queue_legacy_files(
                db,
                email=MOCK_USER["email"],
                owner_sub=None,
            ) == 0
            assert await _claim_and_queue_legacy_files(
                db,
                email=MOCK_USER["email"],
                owner_sub=MOCK_USER["sub"],
            ) == 1
            await db.commit()

        response = await client.post(
            "/api/users",
            json={"email": MOCK_USER["email"], "name": "Legacy owner"},
        )
        assert response.status_code == 200

        async with test_session_factory() as db:
            file_record = (
                await db.execute(select(File).where(File.file_id == file_id))
            ).scalar_one()
            job = (
                await db.execute(select(ProcessingJob).where(ProcessingJob.file_id == file_id))
            ).scalar_one()
            outbox = (
                await db.execute(select(OutboxEvent).where(OutboxEvent.aggregate_id == str(file_id)))
            ).scalar_one()
        assert file_record.owner_sub == MOCK_USER["sub"]
        assert job.kind == "reindex_pdf"
        assert outbox.event_type == "file.process"

    async def test_claim_helper_skips_ineligible_jobs_and_requeues_failed_jobs(self):
        processing_id = uuid.uuid4()
        active_id = uuid.uuid4()
        failed_id = uuid.uuid4()
        async with test_session_factory() as db:
            db.add_all(
                [
                    File(
                        file_id=file_id,
                        file_name=f"{file_id}.pdf",
                        file_type="pdf",
                        storage_key=f"pdf/{file_id}.pdf",
                        created_by=MOCK_USER["email"],
                        owner_sub=None,
                        status=status,
                    )
                    for file_id, status in (
                        (processing_id, "processing"),
                        (active_id, "ready"),
                        (failed_id, "ready"),
                    )
                ]
            )
            await db.flush()
            db.add_all(
                [
                    ProcessingJob(
                        file_id=active_id,
                        kind="reindex_pdf",
                        version=settings.EMBEDDING_VERSION,
                        status="running",
                    ),
                    ProcessingJob(
                        file_id=failed_id,
                        kind="reindex_pdf",
                        version=settings.EMBEDDING_VERSION,
                        status="failed",
                        error_code="old_failure",
                        error_detail="retry me",
                    ),
                ]
            )
            await db.commit()

        async with test_session_factory() as db:
            queued = await _claim_and_queue_legacy_files(
                db,
                email=MOCK_USER["email"],
                owner_sub=MOCK_USER["sub"],
            )
            await db.commit()
            failed_job = (
                await db.execute(
                    select(ProcessingJob).where(ProcessingJob.file_id == failed_id)
                )
            ).scalar_one()
        assert queued == 1
        assert failed_job.status == "queued"
        assert failed_job.error_code is None

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
