"""Tests for transcription service."""

import os
import uuid
from unittest.mock import MagicMock, patch, mock_open

import pytest

from services.transcription_service import TranscriptionService


class TestTranscriptionService:
    """Tests for the transcription service."""

    def test_get_chunks_with_timestamps(self):
        """Test chunking transcript segments with timestamps."""
        service = TranscriptionService.__new__(TranscriptionService)

        segments = [
            {"start": 0.0, "end": 2.0, "text": "Hello world."},
            {"start": 2.0, "end": 4.0, "text": " This is a test."},
            {"start": 4.0, "end": 6.0, "text": " More content here."},
            {"start": 6.0, "end": 8.0, "text": " Even more content."},
        ]

        chunks = service.get_chunks_with_timestamps(segments, chunk_size=30)
        assert len(chunks) > 0
        assert all("text" in c and "start_time" in c and "end_time" in c for c in chunks)

    def test_get_chunks_empty_segments(self):
        """Test chunking with empty segments list."""
        service = TranscriptionService.__new__(TranscriptionService)
        chunks = service.get_chunks_with_timestamps([], chunk_size=500)
        assert chunks == []

    def test_get_chunks_single_segment(self):
        """Test chunking with a single segment."""
        service = TranscriptionService.__new__(TranscriptionService)

        segments = [{"start": 0.0, "end": 5.0, "text": "Only segment."}]
        chunks = service.get_chunks_with_timestamps(segments, chunk_size=500)

        assert len(chunks) == 1
        assert chunks[0]["text"] == "Only segment."
        assert chunks[0]["start_time"] == 0.0
        assert chunks[0]["end_time"] == 5.0

    def test_get_chunks_large_segment(self):
        """Test chunking with text exceeding chunk_size."""
        service = TranscriptionService.__new__(TranscriptionService)

        segments = [
            {"start": 0.0, "end": 5.0, "text": "A" * 600},
            {"start": 5.0, "end": 10.0, "text": "B" * 600},
        ]
        chunks = service.get_chunks_with_timestamps(segments, chunk_size=500)
        assert len(chunks) == 2

    @patch("openai.OpenAI")
    def test_transcribe_calls_whisper(self, mock_openai_cls):
        """Test that transcribe calls the Whisper API correctly."""
        # Create a mock response
        mock_response = MagicMock()
        mock_response.text = "Hello world"
        mock_response.segments = [
            MagicMock(start=0.0, end=2.0, text="Hello"),
            MagicMock(start=2.0, end=4.0, text=" world"),
        ]
        # Make attributes accessible both ways
        for seg in mock_response.segments:
            seg.get = MagicMock(side_effect=lambda key, default=None: getattr(seg, key, default))
        mock_response.duration = 4.0

        mock_client = MagicMock()
        mock_client.audio.transcriptions.create.return_value = mock_response
        mock_openai_cls.return_value = mock_client

        service = TranscriptionService()
        service.client = mock_client

        result = service.transcribe(b"fake-audio-data", "test.mp3")

        assert result["text"] == "Hello world"
        assert result["duration"] == 4.0
        assert len(result["segments"]) == 2

    def test_get_chunks_preserves_order(self):
        """Test that chunks maintain chronological order."""
        service = TranscriptionService.__new__(TranscriptionService)

        segments = [
            {"start": 0.0, "end": 2.0, "text": "First."},
            {"start": 2.0, "end": 4.0, "text": " Second."},
            {"start": 4.0, "end": 6.0, "text": " Third."},
        ]

        chunks = service.get_chunks_with_timestamps(segments, chunk_size=10)
        for i in range(1, len(chunks)):
            assert chunks[i]["start_time"] >= chunks[i - 1]["start_time"]
