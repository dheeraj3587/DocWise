"""Tests for notes CRUD endpoints."""

import uuid

import pytest


@pytest.mark.asyncio
class TestNotes:
    """Tests for /api/notes endpoints."""

    async def test_get_notes_empty(self, client, create_owned_file):
        """Test getting notes for a file with no notes."""
        file_id = await create_owned_file()
        response = await client.get(f"/api/notes/{file_id}")
        assert response.status_code == 200
        assert response.json() == []

    async def test_get_notes_file_not_found(self, client):
        """Test getting notes for a non-existent file returns 404."""
        file_id = str(uuid.uuid4())
        response = await client.get(f"/api/notes/{file_id}")
        assert response.status_code == 404

    async def test_save_note_create(self, client, create_owned_file):
        """Test creating a new note."""
        file_id = await create_owned_file()
        response = await client.put(
            f"/api/notes/{file_id}",
            json={"note": "<p>Hello World</p>"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "saved"

    async def test_save_and_get_note(self, client, create_owned_file):
        """Test saving and then retrieving a note."""
        file_id = await create_owned_file()

        # Save
        await client.put(
            f"/api/notes/{file_id}",
            json={"note": "<p>My notes here</p>"},
        )

        # Get
        response = await client.get(f"/api/notes/{file_id}")
        assert response.status_code == 200
        notes = response.json()
        assert len(notes) == 1
        assert notes[0]["note"] == "<p>My notes here</p>"
        assert notes[0]["createdBy"] == "test@example.com"

    async def test_update_existing_note(self, client, create_owned_file):
        """Test updating an existing note (upsert)."""
        file_id = await create_owned_file()

        # Create
        await client.put(
            f"/api/notes/{file_id}",
            json={"note": "<p>Version 1</p>"},
        )

        # Update
        await client.put(
            f"/api/notes/{file_id}",
            json={"note": "<p>Version 2</p>"},
        )

        # Verify
        response = await client.get(f"/api/notes/{file_id}")
        notes = response.json()
        assert len(notes) == 1
        assert notes[0]["note"] == "<p>Version 2</p>"

    async def test_delete_notes(self, client, create_owned_file):
        """Test deleting notes for a file."""
        file_id = await create_owned_file()

        # Create
        await client.put(
            f"/api/notes/{file_id}",
            json={"note": "<p>To be deleted</p>"},
        )

        # Delete
        response = await client.delete(f"/api/notes/{file_id}")
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

        # Verify
        response = await client.get(f"/api/notes/{file_id}")
        assert response.json() == []

    async def test_delete_nonexistent_notes(self, client, create_owned_file):
        """Test deleting notes for a file with no notes (should not error)."""
        file_id = await create_owned_file()
        response = await client.delete(f"/api/notes/{file_id}")
        assert response.status_code == 200

    async def test_save_note_with_html_content(self, client, create_owned_file):
        """Test saving a note with rich HTML content."""
        file_id = await create_owned_file()
        html_note = (
            '<h1>Title</h1><p>Paragraph with <strong>bold</strong> '
            'and <em>italic</em> text.</p><ul><li>Item 1</li><li>Item 2</li></ul>'
        )
        await client.put(
            f"/api/notes/{file_id}",
            json={"note": html_note},
        )

        response = await client.get(f"/api/notes/{file_id}")
        assert response.json()[0]["note"] == html_note

    async def test_save_note_without_created_by(self, client, create_owned_file):
        """Test saving a note without specifying created_by (uses auth user)."""
        file_id = await create_owned_file()
        response = await client.put(
            f"/api/notes/{file_id}",
            json={"note": "<p>Auto user</p>"},
        )
        assert response.status_code == 200

        notes = (await client.get(f"/api/notes/{file_id}")).json()
        assert notes[0]["createdBy"] == "test@example.com"

    async def test_notes_forbidden_for_other_users_file(self, client):
        """Test that notes operations are forbidden for files owned by others."""
        from models.database import async_session
        from models.file import File

        file_id = str(uuid.uuid4())
        async with async_session() as session:
            f = File(
                file_id=uuid.UUID(file_id),
                file_name="not-mine.pdf",
                file_type="pdf",
                storage_key="key",
                created_by="other@example.com",
                status="ready",
            )
            session.add(f)
            await session.commit()

        # GET should be forbidden
        response = await client.get(f"/api/notes/{file_id}")
        assert response.status_code == 403

        # PUT should be forbidden
        response = await client.put(
            f"/api/notes/{file_id}",
            json={"note": "<p>Unauthorized</p>"},
        )
        assert response.status_code == 403

        # DELETE should be forbidden
        response = await client.delete(f"/api/notes/{file_id}")
        assert response.status_code == 403
