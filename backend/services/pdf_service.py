"""PDF parsing service — extract text and split into chunks."""

from typing import List

from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
import tempfile
import os


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
        # Write PDF bytes to a temporary file for PyPDFLoader
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            loader = PyPDFLoader(tmp_path)
            documents = loader.load()

            split_docs = self.splitter.split_documents(documents)
            chunks = [doc.page_content for doc in split_docs]

            return chunks
        finally:
            os.unlink(tmp_path)

    def extract_full_text(self, pdf_bytes: bytes) -> str:
        """Extract full text from a PDF (used for summarization)."""
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            loader = PyPDFLoader(tmp_path)
            documents = loader.load()
            full_text = " ".join([doc.page_content for doc in documents])
            return full_text
        finally:
            os.unlink(tmp_path)


# Singleton
pdf_service = PDFService()
