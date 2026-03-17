"""
Hybrid vector and graph retrieval for OpenMind.

Backed by persistent JSON storage (``openmind.storage``).  The in-memory
index is populated from disk at import time so previously stored chunks
survive miner restarts.  Every new chunk is written through to disk
immediately.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np

from openmind import storage


@dataclass
class MemoryChunk:
    session_id: str
    content: str
    embedding: np.ndarray
    metadata: Dict[str, Any] = field(default_factory=dict)


_CHUNKS: List[MemoryChunk] = []
_loaded = False


def _ensure_loaded() -> None:
    """Hydrate the in-memory index from disk on first access."""
    global _loaded
    if _loaded:
        return
    _loaded = True
    for raw in storage.load_all_chunks():
        emb = raw.get("embedding") or []
        _CHUNKS.append(
            MemoryChunk(
                session_id=raw["session_id"],
                content=raw["content"],
                embedding=np.array(emb, dtype=np.float32),
                metadata=raw.get("metadata") or {},
            )
        )


def add_chunk(
    session_id: str,
    content: str,
    embedding: List[float],
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Store a chunk in both the in-memory index and on disk."""
    _ensure_loaded()
    meta = metadata or {}
    chunk_id = meta.get("id", "")

    _CHUNKS.append(
        MemoryChunk(
            session_id=session_id,
            content=content,
            embedding=np.array(embedding, dtype=np.float32),
            metadata=meta,
        )
    )

    if chunk_id:
        storage.store_chunk(
            session_id=session_id,
            chunk_id=chunk_id,
            content=content,
            embedding=embedding,
            metadata=meta,
        )


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def enrich_with_graph(
    results: List[Dict[str, Any]],
    graph_hops: int = 0,
    graph_filters: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Stub for future graph-enriched retrieval."""
    _ = graph_hops, graph_filters
    return results


def retrieve(
    session_id: str,
    query: Optional[str],
    embedding: Optional[List[float]],
    top_k: int,
    filters: Dict[str, Any],
    tier: str,
    as_of_timestamp: Optional[str] = None,
    version_id: Optional[str] = None,
    diff_since: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Retrieve chunks for a session.

    - Filters by ``session_id``
    - Applies exact-match metadata filters
    - Ranks by cosine similarity if an embedding is provided
    - Falls back to timestamp order (oldest first) otherwise
    """
    _ensure_loaded()

    candidates = [c for c in _CHUNKS if c.session_id == session_id]

    for key, value in filters.items():
        candidates = [c for c in candidates if c.metadata.get(key) == value]

    def _to_result(chunk: MemoryChunk, score: float = 0.0) -> Dict[str, Any]:
        return {
            "id": chunk.metadata.get("id"),
            "content": chunk.content,
            "role": chunk.metadata.get("role", "user"),
            "score": score,
            "timestamp": chunk.metadata.get("timestamp"),
            "metadata": chunk.metadata,
        }

    if embedding is None or len(candidates) == 0:
        candidates.sort(key=lambda c: c.metadata.get("timestamp", ""))
        base = [_to_result(c) for c in candidates[:top_k]]
        return enrich_with_graph(base)

    q_vec = np.array(embedding, dtype=np.float32)
    scored = [(c, _cosine_sim(q_vec, c.embedding)) for c in candidates]
    scored.sort(key=lambda x: x[1], reverse=True)

    base = [_to_result(c, score) for c, score in scored[:top_k]]
    return enrich_with_graph(base)
