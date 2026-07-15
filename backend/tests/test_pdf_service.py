"""Tests for services.pdf_service — PDFService."""

from unittest.mock import patch, MagicMock

import pytest

from services.pdf_service import PDFService


class TestPDFService:
    """Tests for PDF extraction and chunking."""

    @patch("services.pdf_service.PdfReader")
    def test_extract_and_chunk(self, mock_reader_cls):
        # Mock pages returned by the reader
        page1 = MagicMock()
        page1.extract_text.return_value = "Page one content " * 20
        page2 = MagicMock()
        page2.extract_text.return_value = "Page two content " * 20

        mock_reader = MagicMock()
        mock_reader.pages = [page1, page2]
        mock_reader_cls.return_value = mock_reader

        svc = PDFService()
        chunks = svc.extract_and_chunk(b"%PDF-1.4 test")

        assert isinstance(chunks, list)
        assert len(chunks) > 0
        assert all(isinstance(c, str) for c in chunks)

    @patch("services.pdf_service.PdfReader")
    def test_extract_full_text(self, mock_reader_cls):
        page1 = MagicMock()
        page1.extract_text.return_value = "Hello from page one."
        page2 = MagicMock()
        page2.extract_text.return_value = "Hello from page two."

        mock_reader = MagicMock()
        mock_reader.pages = [page1, page2]
        mock_reader_cls.return_value = mock_reader

        svc = PDFService()
        text = svc.extract_full_text(b"%PDF-1.4 test")

        assert "Hello from page one." in text
        assert "Hello from page two." in text

    @patch("services.pdf_service.PdfReader")
    def test_extract_and_chunk_empty_pdf(self, mock_reader_cls):
        mock_reader = MagicMock()
        mock_reader.pages = []
        mock_reader_cls.return_value = mock_reader

        svc = PDFService()
        chunks = svc.extract_and_chunk(b"%PDF-1.4")
        assert chunks == []

    @patch("services.pdf_service.PdfReader")
    def test_extract_full_text_empty_pdf(self, mock_reader_cls):
        mock_reader = MagicMock()
        mock_reader.pages = []
        mock_reader_cls.return_value = mock_reader

        svc = PDFService()
        text = svc.extract_full_text(b"%PDF-1.4")
        assert text == ""

    @patch("services.pdf_service.PdfReader")
    def test_structured_chunks_skip_blank_pages_and_extract_outline_pages(self, mock_reader_cls):
        blank = MagicMock()
        blank.extract_text.return_value = "   "
        content = MagicMock()
        content.extract_text.return_value = "Section one discusses grounded retrieval."
        mock_reader_cls.return_value.pages = [blank, content]

        service = PDFService(chunk_size=30, chunk_overlap=5)
        chunks = service.extract_structured_chunks(b"pdf")
        pages = service.extract_pages(b"pdf")

        assert chunks
        assert all(chunk["page_start"] == 2 for chunk in chunks)
        assert pages == [{"page": 2, "text": "Section one discusses grounded retrieval."}]

    @patch("services.pdf_service.PdfReader")
    def test_structured_chunk_uses_cursor_when_split_text_is_not_found(self, mock_reader_cls):
        page = MagicMock()
        page.extract_text.return_value = "Original page text"
        mock_reader_cls.return_value.pages = [page]
        service = PDFService()
        service.splitter.split_text = MagicMock(return_value=["normalized text"])

        chunks = service.extract_structured_chunks(b"pdf")

        assert chunks[0]["character_start"] == 0
