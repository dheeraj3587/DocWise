"""PDF parsing service — extract text and split into chunks."""

import io
from typing import List

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
        reader = PdfReader(io.BytesIO(pdf_bytes))
        full_text = "\n".join(
            page.extract_text() or "" for page in reader.pages
        )

        chunks = self.splitter.split_text(full_text)
        return chunks

    def extract_full_text(self, pdf_bytes: bytes) -> str:
        """Extract full text from a PDF (used for summarization)."""
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return " ".join(
            page.extract_text() or "" for page in reader.pages
        )


# Singleton
pdf_service = PDFService()
