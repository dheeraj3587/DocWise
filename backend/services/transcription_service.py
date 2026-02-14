"""Audio/Video transcription service using Azure OpenAI Whisper API."""

import tempfile
import os
from typing import List, Dict, Any

import openai
from openai import AzureOpenAI

from core.config import settings


class TranscriptionService:
    """Transcribes audio/video files using Azure OpenAI Whisper API and returns timestamped segments."""

    def __init__(self):
        if settings.AZURE_OPENAI_WHISPER_API_KEY and settings.AZURE_OPENAI_WHISPER_ENDPOINT:
            self.client = AzureOpenAI(
                api_key=settings.AZURE_OPENAI_WHISPER_API_KEY,
                azure_endpoint=settings.AZURE_OPENAI_WHISPER_ENDPOINT,
                api_version=settings.AZURE_OPENAI_WHISPER_API_VERSION,
            )
            self.model = settings.AZURE_OPENAI_WHISPER_DEPLOYMENT
        else:
            # Fallback to standard OpenAI if Azure Whisper not configured
            self.client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
            self.model = "whisper-1"

    def transcribe(self, file_bytes: bytes, file_name: str) -> Dict[str, Any]:
        """
        Transcribe audio/video file and return text with timestamps.

        Returns:
            {
                "text": "full transcript text",
                "segments": [
                    {"start": 0.0, "end": 5.2, "text": "Hello world"},
                    ...
                ],
                "duration": 120.5
            }
        """
        # Determine file extension from name
        _, ext = os.path.splitext(file_name)
        if not ext:
            ext = ".mp3"

        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as audio_file:
                response = self.client.audio.transcriptions.create(
                    model=self.model,
                    file=audio_file,
                    response_format="verbose_json",
                    timestamp_granularities=["segment"],
                )

            segments = []
            if hasattr(response, "segments") and response.segments:
                for seg in response.segments:
                    # seg can be a Pydantic model (TranscriptionSegment) or a dict
                    if isinstance(seg, dict):
                        segments.append(
                            {
                                "start": seg.get("start", 0.0),
                                "end": seg.get("end", 0.0),
                                "text": seg.get("text", ""),
                            }
                        )
                    else:
                        segments.append(
                            {
                                "start": getattr(seg, "start", 0.0),
                                "end": getattr(seg, "end", 0.0),
                                "text": getattr(seg, "text", ""),
                            }
                        )

            duration = getattr(response, "duration", 0.0) or 0.0

            return {
                "text": response.text,
                "segments": segments,
                "duration": duration,
            }

        finally:
            os.unlink(tmp_path)

    def get_chunks_with_timestamps(
        self, segments: List[Dict], chunk_size: int = 500
    ) -> List[Dict[str, Any]]:
        """
        Group transcript segments into larger chunks for embedding,
        preserving start/end timestamps for each chunk.

        Returns:
            [
                {
                    "text": "chunk text...",
                    "start_time": 0.0,
                    "end_time": 25.3
                },
                ...
            ]
        """
        if not segments:
            return []

        chunks = []
        current_text = ""
        current_start = segments[0]["start"]

        for seg in segments:
            if len(current_text) + len(seg["text"]) > chunk_size and current_text:
                chunks.append(
                    {
                        "text": current_text.strip(),
                        "start_time": current_start,
                        "end_time": seg["start"],
                    }
                )
                current_text = seg["text"]
                current_start = seg["start"]
            else:
                current_text += " " + seg["text"]

        # Don't forget the last chunk
        if current_text.strip():
            chunks.append(
                {
                    "text": current_text.strip(),
                    "start_time": current_start,
                    "end_time": segments[-1]["end"],
                }
            )

        return chunks


# Singleton
transcription_service = TranscriptionService()
