"""Tests for services.embedding_service - EmbeddingService."""

from unittest.mock import MagicMock, patch

import numpy as np

from services.embedding_service import EmbeddingService


class TestEmbeddingService:
    """Tests for EmbeddingService methods."""

    @patch("services.embedding_service.TextEmbedding")
    @patch("services.embedding_service.faiss_index")
    def test_ingest_document_with_chunks(self, mock_faiss, mock_embedding_cls):
        mock_model = MagicMock()
        mock_model.embed.return_value = [
            np.array([0.1] * 384),
            np.array([0.2] * 384),
        ]
        mock_embedding_cls.return_value = mock_model

        svc = EmbeddingService()
        svc.ingest_document("file-123", ["chunk a", "chunk b"])

        mock_model.embed.assert_called_once_with(["chunk a", "chunk b"])
        mock_faiss.add_embeddings.assert_called_once()

        call_args = mock_faiss.add_embeddings.call_args
        metadata = call_args[0][2]
        assert len(metadata) == 2
        assert metadata[0]["text"] == "chunk a"
        assert metadata[0]["file_id"] == "file-123"

    @patch("services.embedding_service.TextEmbedding")
    @patch("services.embedding_service.faiss_index")
    def test_ingest_document_with_timestamps(self, mock_faiss, mock_embedding_cls):
        mock_model = MagicMock()
        mock_model.embed.return_value = [np.array([0.1] * 384)]
        mock_embedding_cls.return_value = mock_model

        svc = EmbeddingService()
        timestamps = [{"start_time": 0.0, "end_time": 5.0}]
        svc.ingest_document("file-456", ["chunk"], timestamps=timestamps)

        call_args = mock_faiss.add_embeddings.call_args
        metadata = call_args[0][2]
        assert metadata[0]["start_time"] == 0.0
        assert metadata[0]["end_time"] == 5.0

    @patch("services.embedding_service.TextEmbedding")
    @patch("services.embedding_service.faiss_index")
    def test_ingest_document_empty_chunks(self, mock_faiss, mock_embedding_cls):
        mock_embedding_cls.return_value = MagicMock()

        svc = EmbeddingService()
        svc.ingest_document("file-789", [])

        mock_faiss.add_embeddings.assert_not_called()

    @patch("services.embedding_service.TextEmbedding")
    @patch("services.embedding_service.faiss_index")
    def test_search_similar(self, mock_faiss, mock_embedding_cls):
        mock_model = MagicMock()
        mock_model.embed.return_value = [np.array([0.1] * 384)]
        mock_embedding_cls.return_value = mock_model

        mock_faiss.search.return_value = [
            {"text": "result", "score": 0.95, "file_id": "f1"}
        ]

        svc = EmbeddingService()
        results = svc.search_similar("f1", "query text", top_k=3)

        mock_model.embed.assert_called_once_with(["query text"])
        mock_faiss.search.assert_called_once()
        assert len(results) == 1
        assert results[0]["text"] == "result"

    @patch("services.embedding_service.TextEmbedding")
    @patch("services.embedding_service.faiss_index")
    def test_embed_texts(self, mock_faiss, mock_embedding_cls):
        mock_model = MagicMock()
        mock_model.embed.return_value = [np.array([0.1, 0.2])]
        mock_embedding_cls.return_value = mock_model

        svc = EmbeddingService()
        result = svc.embed_texts(["hello"])
        assert result == [[0.1, 0.2]]

    @patch("services.embedding_service.TextEmbedding")
    @patch("services.embedding_service.faiss_index")
    def test_embed_query(self, mock_faiss, mock_embedding_cls):
        mock_model = MagicMock()
        mock_model.embed.return_value = [np.array([0.5, 0.6])]
        mock_embedding_cls.return_value = mock_model

        svc = EmbeddingService()
        result = svc.embed_query("test query")
        assert result == [0.5, 0.6]
