"""FAISS vector store — stores and searches document/transcript embeddings."""

import json
import os
import threading
import time
from typing import List, Dict, Any, Optional, Tuple

import faiss
import numpy as np

from core.config import settings


class _IndexCache:
    """Thread-safe LRU cache for loaded FAISS indexes and metadata."""

    def __init__(self, maxsize: int = 100, ttl: int = 600):
        self._maxsize = maxsize
        self._ttl = ttl  # seconds
        self._cache: Dict[str, Tuple[Any, List[Dict[str, Any]], float]] = {}
        self._lock = threading.Lock()

    def get(self, file_id: str) -> Optional[Tuple[Any, List[Dict[str, Any]]]]:
        with self._lock:
            entry = self._cache.get(file_id)
            if entry is None:
                return None
            index, metadata, ts = entry
            if time.monotonic() - ts > self._ttl:
                del self._cache[file_id]
                return None
            return index, metadata

    def put(self, file_id: str, index: Any, metadata: List[Dict[str, Any]]) -> None:
        with self._lock:
            # Evict oldest if at capacity
            if len(self._cache) >= self._maxsize and file_id not in self._cache:
                oldest_key = min(self._cache, key=lambda k: self._cache[k][2])
                del self._cache[oldest_key]
            self._cache[file_id] = (index, metadata, time.monotonic())

    def invalidate(self, file_id: str) -> None:
        with self._lock:
            self._cache.pop(file_id, None)


class FAISSIndex:
    """
    Manages per-file FAISS indices for similarity search.
    Each file gets its own index stored on disk.
    """

    def __init__(self, index_dir: str = None, dimension: int = 3072):
        self.index_dir = index_dir or settings.FAISS_INDEX_PATH
        self.dimension = dimension
        os.makedirs(self.index_dir, exist_ok=True)
        self._cache = _IndexCache(maxsize=100, ttl=600)

    def _index_path(self, file_id: str) -> str:
        return os.path.join(self.index_dir, f"{file_id}.index")

    def _meta_path(self, file_id: str) -> str:
        return os.path.join(self.index_dir, f"{file_id}.meta.json")

    def _legacy_meta_path(self, file_id: str) -> str:
        """Legacy pickle-based metadata path for migration compatibility."""
        return os.path.join(self.index_dir, f"{file_id}.meta")

    def _load_metadata(self, file_id: str) -> Optional[List[Dict[str, Any]]]:
        """Load metadata, supporting both JSON (preferred) and legacy pickle formats."""
        json_path = self._meta_path(file_id)
        if os.path.exists(json_path):
            with open(json_path, "r") as f:
                return json.load(f)

        # Fallback: read legacy pickle and migrate to JSON
        legacy_path = self._legacy_meta_path(file_id)
        if os.path.exists(legacy_path):
            import pickle
            with open(legacy_path, "rb") as f:
                metadata = pickle.load(f)
            # Migrate: write JSON and remove pickle
            with open(json_path, "w") as f:
                json.dump(metadata, f)
            os.remove(legacy_path)
            return metadata

        return None

    def add_embeddings(
        self,
        file_id: str,
        embeddings: List[List[float]],
        metadata: List[Dict[str, Any]],
    ) -> None:
        """
        Store embeddings with metadata for a given file.

        Args:
            file_id: UUID of the file
            embeddings: list of embedding vectors
            metadata: list of dicts (one per embedding), e.g. {"text": "...", "start_time": 0.0}
        """
        if not embeddings:
            return

        vectors = np.array(embeddings, dtype=np.float32)
        dim = vectors.shape[1]

        index = faiss.IndexFlatL2(dim)
        index.add(vectors)

        faiss.write_index(index, self._index_path(file_id))

        with open(self._meta_path(file_id), "w") as f:
            json.dump(metadata, f)

        # Invalidate cache so next search picks up new data
        self._cache.invalidate(file_id)

    def search(
        self,
        file_id: str,
        query_embedding: List[float],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Search for the most similar chunks to a query embedding.

        Returns list of metadata dicts with an added 'score' field.
        """
        # Try cache first
        cached = self._cache.get(file_id)
        if cached is not None:
            index, metadata = cached
        else:
            index_path = self._index_path(file_id)
            if not os.path.exists(index_path):
                return []

            metadata = self._load_metadata(file_id)
            if metadata is None:
                return []

            index = faiss.read_index(index_path)
            self._cache.put(file_id, index, metadata)

        query_vector = np.array([query_embedding], dtype=np.float32)
        distances, indices = index.search(query_vector, min(top_k, index.ntotal))

        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0 or idx >= len(metadata):
                continue
            result = {**metadata[idx], "score": float(dist)}
            results.append(result)

        return results

    def delete_index(self, file_id: str) -> None:
        """Delete a file's FAISS index and metadata."""
        self._cache.invalidate(file_id)
        for path in [self._index_path(file_id), self._meta_path(file_id), self._legacy_meta_path(file_id)]:
            if os.path.exists(path):
                os.remove(path)

    def index_exists(self, file_id: str) -> bool:
        """Check if a FAISS index exists for a file."""
        return os.path.exists(self._index_path(file_id))


# Singleton
faiss_index = FAISSIndex()
