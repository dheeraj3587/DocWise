"""PDF parsing service — extract text and split into chunks."""

import io
from typing import List, TypedDict

from pypdf import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter


class PDFService:
    """Handles PDF text extraction and chunking."""

    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )

    def extract_and_chunk(self, pdf_bytes: bytes) -> List[str]:
        """
        Extract text from a PDF and split into chunks.
        Returns a list of text chunks ready for embedding.
        """
        return [chunk["text"] for chunk in self.extract_structured_chunks(pdf_bytes)]

    def extract_structured_chunks(self, pdf_bytes: bytes) -> list[dict[str, object]]:
        """Split each page independently so citations keep exact page metadata."""
        reader = PdfReader(io.BytesIO(pdf_bytes))
        chunks: list[dict[str, object]] = []
        ordinal = 0

        for page_index, page in enumerate(reader.pages):
            page_text = (page.extract_text() or "").strip()
            if not page_text:
                continue

            cursor = 0
            for text in self.splitter.split_text(page_text):
                search_from = max(0, cursor - self.splitter._chunk_overlap)
                start = page_text.find(text, search_from)
                if start < 0:
                    start = cursor
                end = start + len(text)
                chunks.append(
                    {
                        "ordinal": ordinal,
                        "text": text,
                        "page_start": page_index + 1,
                        "page_end": page_index + 1,
                        "character_start": start,
                        "character_end": end,
                        "start_time": None,
                        "end_time": None,
                    }
                )
                ordinal += 1
                cursor = end

        return chunks

    def extract_full_text(self, pdf_bytes: bytes) -> str:
        """Extract full text from a PDF (used for summarization)."""
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return " ".join(
            page.extract_text() or "" for page in reader.pages
        )

    def extract_pages(self, pdf_bytes: bytes) -> list[dict[str, object]]:
        """Extract page-numbered text for outline/topic generation."""
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages: list[dict[str, object]] = []
        for index, page in enumerate(reader.pages):
            text = (page.extract_text() or "").strip()
            if text:
                pages.append({"page": index + 1, "text": text})
        return pages


# Singleton
pdf_service = PDFService()
