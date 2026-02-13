"""Tests for notes CRUD endpoints."""

import uuid

import pytest


@pytest.mark.asyncio
class TestNotes:
    """Tests for /api/notes endpoints."""

    async def test_get_notes_empty(self, client):
        """Test getting notes for a file with no notes."""
        file_id = str(uuid.uuid4())
        response = await client.get(f"/api/notes/{file_id}")
        assert response.status_code == 200
        assert response.json() == []

    async def test_save_note_create(self, client):
        """Test creating a new note."""
        file_id = str(uuid.uuid4())
        response = await client.put(
            f"/api/notes/{file_id}",
            json={"note": "<p>Hello World</p>", "created_by": "test@example.com"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "saved"

    async def test_save_and_get_note(self, client):
        """Test saving and then retrieving a note."""
        file_id = str(uuid.uuid4())

        # Save
        await client.put(
            f"/api/notes/{file_id}",
            json={"note": "<p>My notes here</p>", "created_by": "test@example.com"},
        )

        # Get
        response = await client.get(f"/api/notes/{file_id}")
        assert response.status_code == 200
        notes = response.json()
        assert len(notes) == 1
        assert notes[0]["note"] == "<p>My notes here</p>"
        assert notes[0]["createdBy"] == "test@example.com"

    async def test_update_existing_note(self, client):
        """Test updating an existing note (upsert)."""
        file_id = str(uuid.uuid4())

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

    async def test_delete_notes(self, client):
        """Test deleting notes for a file."""
        file_id = str(uuid.uuid4())

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

    async def test_delete_nonexistent_notes(self, client):
        """Test deleting notes for a file with no notes (should not error)."""
        file_id = str(uuid.uuid4())
        response = await client.delete(f"/api/notes/{file_id}")
        assert response.status_code == 200

    async def test_save_note_with_html_content(self, client):
        """Test saving a note with rich HTML content."""
        file_id = str(uuid.uuid4())
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

    async def test_save_note_without_created_by(self, client):
        """Test saving a note without specifying created_by (uses auth user)."""
        file_id = str(uuid.uuid4())
        response = await client.put(
            f"/api/notes/{file_id}",
            json={"note": "<p>Auto user</p>"},
        )
        assert response.status_code == 200

        notes = (await client.get(f"/api/notes/{file_id}")).json()
        assert notes[0]["createdBy"] == "test@example.com"
