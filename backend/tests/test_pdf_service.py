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
