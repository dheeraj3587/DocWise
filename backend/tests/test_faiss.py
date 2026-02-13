"""Tests for FAISS vector store."""

import os
import shutil
import uuid

import numpy as np
import pytest

from vector_store.faiss_index import FAISSIndex


class TestFAISSIndex:
    """Tests for the FAISS index service."""

    @pytest.fixture(autouse=True)
    def setup_index(self, tmp_path):
        """Create a FAISS index instance with a temp directory."""
        self.index_dir = str(tmp_path / "faiss_test")
        self.index = FAISSIndex(index_dir=self.index_dir, dimension=4)
        self.file_id = str(uuid.uuid4())

    def test_add_and_search(self):
        """Test adding embeddings and searching."""
        embeddings = [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0]]
        metadata = [
            {"text": "chunk 1"},
            {"text": "chunk 2"},
            {"text": "chunk 3"},
        ]

        self.index.add_embeddings(self.file_id, embeddings, metadata)
        results = self.index.search(self.file_id, [1.0, 0.0, 0.0, 0.0], top_k=2)

        assert len(results) == 2
        assert results[0]["text"] == "chunk 1"  # Most similar

    def test_search_nonexistent_index(self):
        """Test searching for a file with no index."""
        results = self.index.search("nonexistent", [1.0, 0.0, 0.0, 0.0])
        assert results == []

    def test_delete_index(self):
        """Test deleting a FAISS index."""
        embeddings = [[1.0, 0.0, 0.0, 0.0]]
        metadata = [{"text": "test"}]

        self.index.add_embeddings(self.file_id, embeddings, metadata)
        assert self.index.index_exists(self.file_id)

        self.index.delete_index(self.file_id)
        assert not self.index.index_exists(self.file_id)

    def test_delete_nonexistent_index(self):
        """Test deleting an index that doesn't exist (should not error)."""
        self.index.delete_index("nonexistent")

    def test_index_exists(self):
        """Test checking if an index exists."""
        assert not self.index.index_exists(self.file_id)

        self.index.add_embeddings(
            self.file_id, [[0.0, 0.0, 0.0, 1.0]], [{"text": "test"}]
        )
        assert self.index.index_exists(self.file_id)

    def test_add_empty_embeddings(self):
        """Test adding empty embeddings does nothing."""
        self.index.add_embeddings(self.file_id, [], [])
        assert not self.index.index_exists(self.file_id)

    def test_search_top_k_larger_than_index(self):
        """Test searching with top_k > number of vectors."""
        embeddings = [[1.0, 0.0, 0.0, 0.0]]
        metadata = [{"text": "only one"}]

        self.index.add_embeddings(self.file_id, embeddings, metadata)
        results = self.index.search(self.file_id, [1.0, 0.0, 0.0, 0.0], top_k=10)

        assert len(results) == 1

    def test_metadata_preserved(self):
        """Test that metadata is preserved through storage."""
        embeddings = [[1.0, 0.0, 0.0, 0.0]]
        metadata = [
            {
                "text": "hello",
                "start_time": 5.0,
                "end_time": 10.0,
                "file_id": self.file_id,
            }
        ]

        self.index.add_embeddings(self.file_id, embeddings, metadata)
        results = self.index.search(self.file_id, [1.0, 0.0, 0.0, 0.0], top_k=1)

        assert results[0]["text"] == "hello"
        assert results[0]["start_time"] == 5.0
        assert results[0]["end_time"] == 10.0

    def test_multiple_files_independent(self):
        """Test that indices for different files are independent."""
        file_id_2 = str(uuid.uuid4())

        self.index.add_embeddings(
            self.file_id, [[1.0, 0.0, 0.0, 0.0]], [{"text": "file1"}]
        )
        self.index.add_embeddings(
            file_id_2, [[0.0, 1.0, 0.0, 0.0]], [{"text": "file2"}]
        )

        r1 = self.index.search(self.file_id, [1.0, 0.0, 0.0, 0.0], top_k=1)
        r2 = self.index.search(file_id_2, [0.0, 1.0, 0.0, 0.0], top_k=1)

        assert r1[0]["text"] == "file1"
        assert r2[0]["text"] == "file2"

    def test_score_is_float(self):
        """Test that search results include a float score."""
        self.index.add_embeddings(
            self.file_id, [[1.0, 0.0, 0.0, 0.0]], [{"text": "test"}]
        )
        results = self.index.search(self.file_id, [1.0, 0.0, 0.0, 0.0], top_k=1)
        assert isinstance(results[0]["score"], float)
