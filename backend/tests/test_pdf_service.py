"""Tests for services.pdf_service — PDFService."""

from unittest.mock import patch, MagicMock

import pytest

from services.pdf_service import PDFService


class TestPDFService:
    """Tests for PDF extraction and chunking."""

    @patch("services.pdf_service.PyPDFLoader")
    def test_extract_and_chunk(self, mock_loader_cls):
        # Mock documents returned by the loader
        doc1 = MagicMock()
        doc1.page_content = "Page one content " * 20
        doc1.metadata = {"source": "test.pdf", "page": 0}
        doc2 = MagicMock()
        doc2.page_content = "Page two content " * 20
        doc2.metadata = {"source": "test.pdf", "page": 1}

        mock_loader = MagicMock()
        mock_loader.load.return_value = [doc1, doc2]
        mock_loader_cls.return_value = mock_loader

        svc = PDFService()
        chunks = svc.extract_and_chunk(b"%PDF-1.4 test")

        assert isinstance(chunks, list)
        assert len(chunks) > 0
        assert all(isinstance(c, str) for c in chunks)

    @patch("services.pdf_service.PyPDFLoader")
    def test_extract_full_text(self, mock_loader_cls):
        doc1 = MagicMock()
        doc1.page_content = "Hello from page one."
        doc1.metadata = {}
        doc2 = MagicMock()
        doc2.page_content = "Hello from page two."
        doc2.metadata = {}

        mock_loader = MagicMock()
        mock_loader.load.return_value = [doc1, doc2]
        mock_loader_cls.return_value = mock_loader

        svc = PDFService()
        text = svc.extract_full_text(b"%PDF-1.4 test")

        assert "Hello from page one." in text
        assert "Hello from page two." in text

    @patch("services.pdf_service.PyPDFLoader")
    def test_extract_and_chunk_empty_pdf(self, mock_loader_cls):
        mock_loader = MagicMock()
        mock_loader.load.return_value = []
        mock_loader_cls.return_value = mock_loader

        svc = PDFService()
        chunks = svc.extract_and_chunk(b"%PDF-1.4")
        assert chunks == []

    @patch("services.pdf_service.PyPDFLoader")
    def test_extract_full_text_empty_pdf(self, mock_loader_cls):
        mock_loader = MagicMock()
        mock_loader.load.return_value = []
        mock_loader_cls.return_value = mock_loader

        svc = PDFService()
        text = svc.extract_full_text(b"%PDF-1.4")
        assert text == ""
