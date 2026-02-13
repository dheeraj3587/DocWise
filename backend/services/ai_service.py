"""AI service — LLM calls for chat, summarization, and RAG responses (Azure OpenAI)."""

import json
from typing import AsyncGenerator, List, Dict, Any, Optional

from langchain_openai import AzureChatOpenAI

from core.config import settings


class AIService:
    """Handles all LLM interactions — chat, summarization, RAG."""

    def __init__(self):
        # Normal mode — gpt-5-mini (fast, cost-effective)
        self.llm = AzureChatOpenAI(
            azure_deployment=settings.AZURE_OPENAI_CHAT_DEPLOYMENT,
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_key=settings.AZURE_OPENAI_API_KEY,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            streaming=True,
        )
        self.llm_sync = AzureChatOpenAI(
            azure_deployment=settings.AZURE_OPENAI_CHAT_DEPLOYMENT,
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_key=settings.AZURE_OPENAI_API_KEY,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            streaming=False,
        )
        # Deep mode — gpt-5.2 (more capable, deeper reasoning)
        self.llm_deep = AzureChatOpenAI(
            azure_deployment=settings.AZURE_OPENAI_DEEP_DEPLOYMENT,
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_key=settings.AZURE_OPENAI_API_KEY,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            streaming=True,
        )
        self.llm_deep_sync = AzureChatOpenAI(
            azure_deployment=settings.AZURE_OPENAI_DEEP_DEPLOYMENT,
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_key=settings.AZURE_OPENAI_API_KEY,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            streaming=False,
        )

    def _get_llm(self, deep_mode: bool = False, sync: bool = False):
        """Return the appropriate LLM based on mode."""
        if deep_mode:
            return self.llm_deep_sync if sync else self.llm_deep
        return self.llm_sync if sync else self.llm

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

        prompt = f"""You are a helpful assistant that answers questions based on the provided context.
Use ONLY the context below to answer. If the context doesn't contain the answer, say so.
{timestamp_instruction}
Context:
{context_text}

Question: {question}

Answer:"""

        llm = self._get_llm(deep_mode=deep_mode)
        async for chunk in llm.astream(prompt):
            if chunk.content:
                yield chunk.content

    async def chat_no_context(self, question: str, deep_mode: bool = False) -> AsyncGenerator[str, None]:
        """Stream answer without RAG context (general question)."""
        llm = self._get_llm(deep_mode=deep_mode)
        async for chunk in llm.astream(question):
            if chunk.content:
                yield chunk.content

    async def summarize(self, text: str, deep_mode: bool = False) -> str:
        """Generate a summary of the given text."""
        prompt = f"""Provide a comprehensive but concise summary of the following content.
Organize the summary with clear sections and key points.

Content:
{text}

Summary:"""

        llm = self._get_llm(deep_mode=deep_mode, sync=True)
        response = await llm.ainvoke(prompt)
        return response.content

    async def summarize_stream(self, text: str, deep_mode: bool = False) -> AsyncGenerator[str, None]:
        """Stream a summary of the given text."""
        prompt = f"""Provide a comprehensive but concise summary of the following content.
Organize the summary with clear sections and key points.

Content:
{text}

Summary:"""

        llm = self._get_llm(deep_mode=deep_mode)
        async for chunk in llm.astream(prompt):
            if chunk.content:
                yield chunk.content


# Singleton
ai_service = AIService()
