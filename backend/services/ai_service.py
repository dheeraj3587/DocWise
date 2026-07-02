"""AI service - LLM calls for chat, summarization, and RAG responses via Cerebras."""

import json
from typing import AsyncGenerator, List, Dict, Any, Optional

from openai import AsyncOpenAI

from core.config import settings


class AIService:
    """Handles all LLM interactions — chat, summarization, RAG."""

    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=settings.CEREBRAS_API_KEY,
            base_url=settings.CEREBRAS_BASE_URL,
        )

    def _get_model(self, deep_mode: bool = False) -> str:
        """Return the appropriate Cerebras model based on mode."""
        return settings.CEREBRAS_DEEP_MODEL if deep_mode else settings.CEREBRAS_CHAT_MODEL

    async def _stream_prompt(self, prompt: str, deep_mode: bool = False) -> AsyncGenerator[str, None]:
        stream = await self.client.chat.completions.create(
            model=self._get_model(deep_mode),
            messages=[{"role": "user", "content": prompt}],
            stream=True,
        )
        async for chunk in stream:
            text = chunk.choices[0].delta.content if chunk.choices else None
            if text:
                yield text

    async def _complete_prompt(self, prompt: str, deep_mode: bool = False) -> str:
        response = await self.client.chat.completions.create(
            model=self._get_model(deep_mode),
            messages=[{"role": "user", "content": prompt}],
        )
        if not response.choices:
            return ""
        return response.choices[0].message.content or ""

    async def chat_stream(
        self, question: str, context_chunks: List[Dict[str, Any]], deep_mode: bool = False
    ) -> AsyncGenerator[str, None]:
        """
        Stream a RAG-based answer. Yields chunks of text for SSE.
        Includes timestamp references when context has timestamps.
        """
        context_parts = []
        has_timestamps = False

        for chunk in context_chunks:
            text = chunk.get("text", "")
            start = chunk.get("start_time")
            end = chunk.get("end_time")
            if start is not None and end is not None:
                has_timestamps = True
                context_parts.append(f"[{start:.1f}s - {end:.1f}s]: {text}")
            else:
                context_parts.append(text)

        context_text = "\n\n".join(context_parts)

        timestamp_instruction = ""
        if has_timestamps:
            timestamp_instruction = (
                "\nWhen your answer references information from the source, "
                "include the relevant timestamp in the format [MM:SS] so the user "
                "can jump to that part of the audio/video. "
            )

        prompt = f"""You are DocWise, an intelligent document assistant.
Answer questions based ONLY on the provided context below.
Provide a **detailed and thorough** answer — do not be brief.
Format your responses using markdown for readability:
- Use **bold** for key terms and important points
- Use bullet points or numbered lists when listing multiple items
- Use ## headings to organize longer answers into clear sections
- Use `code` formatting for technical terms when appropriate
- Include relevant details, examples, and explanations from the context
- If the context does not contain the answer, clearly state that
{timestamp_instruction}
Context:
{context_text}

Question: {question}

Answer:"""

        async for text in self._stream_prompt(prompt, deep_mode=deep_mode):
            yield text

    async def chat_no_context(self, question: str, deep_mode: bool = False) -> AsyncGenerator[str, None]:
        """Stream answer without RAG context (general question)."""
        async for text in self._stream_prompt(question, deep_mode=deep_mode):
            yield text

    async def summarize(self, text: str, deep_mode: bool = False) -> str:
        """Generate a summary of the given text."""
        prompt = f"""Generate a well-structured summary using markdown formatting:
- Start with a brief overview (2-3 sentences)
- Use ## headings to organize key topics
- Use bullet points for important details under each topic
- Highlight **key terms** and **critical information** in bold
- End with a Key Takeaways section if the content is long
- Be comprehensive but concise

Content:
{text}

Summary:"""

        return await self._complete_prompt(prompt, deep_mode=deep_mode)

    async def summarize_stream(self, text: str, deep_mode: bool = False) -> AsyncGenerator[str, None]:
        """Stream a summary of the given text."""
        prompt = f"""Generate a well-structured summary using markdown formatting:
- Start with a brief overview (2-3 sentences)
- Use ## headings to organize key topics
- Use bullet points for important details under each topic
- Highlight **key terms** and **critical information** in bold
- End with a Key Takeaways section if the content is long
- Be comprehensive but concise

Content:
{text}

Summary:"""

        async for text in self._stream_prompt(prompt, deep_mode=deep_mode):
            yield text


# Singleton
ai_service = AIService()
