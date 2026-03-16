"""
Hybrid vector and graph retrieval for OpenMind.

MVP: purely in-memory vector store with simple metadata filters. This provides a
clean interface that can later be backed by a real ANN index and graph store.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np


@dataclass
class MemoryChunk:
    session_id: str
    content: str
    embedding: np.ndarray
    metadata: Dict[str, Any] = field(default_factory=dict)


_CHUNKS: List[MemoryChunk] = []


def add_chunk(
    session_id: str,
    content: str,
    embedding: List[float],
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Add a memory chunk into the in-memory index.
    """
    _CHUNKS.append(
        MemoryChunk(
            session_id=session_id,
            content=content,
            embedding=np.array(embedding, dtype=np.float32),
            metadata=metadata or {},
        )
    )


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


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
    MVP retrieval:
    - restricts to `session_id`
    - applies exact-match metadata filters
    - ranks by cosine similarity if an embedding is provided
    """
    candidates = [c for c in _CHUNKS if c.session_id == session_id]

    # Apply simple exact-match filters on metadata.
    for key, value in filters.items():
        candidates = [c for c in candidates if c.metadata.get(key) == value]

    if embedding is None or len(candidates) == 0:
        # No vector query; just return the latest up to top_k.
        return [
            {
                "content": c.content,
                "score": 0.0,
                "metadata": c.metadata,
            }
            for c in candidates[:top_k]
        ]

    q_vec = np.array(embedding, dtype=np.float32)

    scored = [
        (c, _cosine_sim(q_vec, c.embedding))
        for c in candidates
    ]
    scored.sort(key=lambda x: x[1], reverse=True)

    return [
        {
            "content": c.content,
            "score": score,
            "metadata": c.metadata,
        }
        for c, score in scored[:top_k]
    ]

