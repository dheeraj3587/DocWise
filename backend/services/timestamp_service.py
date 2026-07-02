"""Timestamp extraction service — identifies topics and timestamps in media transcripts."""

from typing import List, Dict, Any
import json

from openai import AsyncOpenAI
from core.config import settings


class TimestampService:
    """Extracts topic-level timestamps from transcription segments."""

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.CEREBRAS_API_KEY,
            base_url=settings.CEREBRAS_BASE_URL,
        )

    async def extract_topics(
        self, segments: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Use LLM to identify topic boundaries from transcript segments.

        Returns:
            [
                {
                    "topic": "Introduction to Machine Learning",
                    "start_time": 0.0,
                    "end_time": 45.5,
                    "text": "combined text of segments in this topic"
                },
                ...
            ]
        """
        if not segments:
            return []

        # Build a transcript with timestamps for the LLM
        transcript_lines = []
        for seg in segments:
            start = seg.get("start", seg.get("start_time", 0))
            end = seg.get("end", seg.get("end_time", 0))
            text = seg["text"]
            transcript_lines.append(f"[{start:.1f}s - {end:.1f}s] {text}")

        transcript_text = "\n".join(transcript_lines)

        prompt = f"""Analyze the following timestamped transcript and identify distinct topics/sections.
For each topic, provide:
- topic: a short descriptive title
- start_time: when the topic starts (in seconds)
- end_time: when the topic ends (in seconds)
- text: a brief summary of what's discussed

Return ONLY a valid JSON array, no markdown code blocks or other text.

Transcript:
{transcript_text}

Return JSON array:"""

        response = await self.client.chat.completions.create(
            model=settings.CEREBRAS_CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
        content = response.choices[0].message.content.strip() if response.choices else ""

        # Clean up markdown code blocks if present
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        try:
            topics = json.loads(content)
            return topics if isinstance(topics, list) else []
        except json.JSONDecodeError:
            return []


# Singleton
timestamp_service = TimestampService()
