"""
Hybrid vector, keyword, and graph retrieval for OpenMind.

Three retrieval paths:
- ``retrieve()``: legacy single-pass retrieval (backward-compatible)
- ``retrieve_smart()``: two-phase retrieval (facts -> source episodes + anchor)
- ``enrich_with_graph()``: PageRank-style graph walk over fact relationships

Backed by persistent JSON storage (``openmind.storage``).  The in-memory
index is populated from disk at import time so previously stored chunks
survive miner restarts.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np

from openmind import durability, storage, storage_v2

try:
    from rank_bm25 import BM25Okapi
    _HAS_BM25 = True
except ImportError:
    _HAS_BM25 = False


@dataclass
class MemoryChunk:
    session_id: str
    content: str
    embedding: np.ndarray
    metadata: Dict[str, Any] = field(default_factory=dict)


_CHUNKS: List[MemoryChunk] = []
_loaded = False
_STORAGE_BACKEND = os.environ.get("OPENMIND_STORAGE_BACKEND", "legacy").lower()
_DUAL_WRITE = os.environ.get("OPENMIND_STORAGE_DUAL_WRITE", "false").lower() == "true"
_NON_METADATA_FILTERS = frozenset({
    "challenge_mode",
    "rs_chunk_id",
    "rs_drop_indices",
})


def _chunk_metadata_filters(filters: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in filters.items() if k not in _NON_METADATA_FILTERS}


def _primary_storage():
    return storage_v2 if _STORAGE_BACKEND == "sqlite" else storage


def _secondary_storage():
    return storage if _STORAGE_BACKEND == "sqlite" else storage_v2


def _ensure_loaded() -> None:
    """Hydrate the in-memory index from disk on first access."""
    global _loaded
    if _loaded:
        return
    _loaded = True
    for raw in _primary_storage().load_all_chunks():
        emb = raw.get("embedding") or []
        _CHUNKS.append(
            MemoryChunk(
                session_id=raw["session_id"],
                content=raw["content"],
                embedding=np.array(emb, dtype=np.float32),
                metadata=raw.get("metadata") or {},
            )
        )


# ---- Chunk management -------------------------------------------------------

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

    existing = None
    if meta.get("type") == "anchor":
        for i, c in enumerate(_CHUNKS):
            if (c.session_id == session_id
                    and c.metadata.get("type") == "anchor"):
                existing = i
                break

    if existing is not None:
        _CHUNKS[existing] = MemoryChunk(
            session_id=session_id,
            content=content,
            embedding=np.array(embedding, dtype=np.float32),
            metadata=meta,
        )
    else:
        _CHUNKS.append(
            MemoryChunk(
                session_id=session_id,
                content=content,
                embedding=np.array(embedding, dtype=np.float32),
                metadata=meta,
            )
        )

    if chunk_id:
        _primary_storage().store_chunk(
            session_id=session_id,
            chunk_id=chunk_id,
            content=content,
            embedding=embedding,
            metadata=meta,
        )
        if _DUAL_WRITE:
            _secondary_storage().store_chunk(
                session_id=session_id,
                chunk_id=chunk_id,
                content=content,
                embedding=embedding,
                metadata=meta,
            )

        if os.environ.get("OPENMIND_RS_SHARDS", "true").lower() not in (
            "0",
            "false",
            "no",
        ):
            try:
                durability.persist_chunk_rs(
                    session_id=session_id,
                    content=content,
                    embedding=list(embedding),
                    metadata=meta,
                )
            except OSError:
                pass


def update_fact_latest(session_id: str, fact_id: str, is_latest: bool) -> None:
    """Update the is_latest flag on a fact in the in-memory index."""
    _ensure_loaded()
    for c in _CHUNKS:
        if c.session_id == session_id and c.metadata.get("id") == fact_id:
            c.metadata["is_latest"] = is_latest
            break


def get_facts_for_session(session_id: str) -> List[Dict[str, Any]]:
    """Return all fact metadata dicts for a session."""
    _ensure_loaded()
    results = []
    for c in _CHUNKS:
        if c.session_id == session_id and c.metadata.get("type") == "fact":
            results.append(dict(c.metadata, content=c.content))
    return results


def get_anchor_for_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Return the session anchor if one exists."""
    _ensure_loaded()
    for c in _CHUNKS:
        if c.session_id == session_id and c.metadata.get("type") == "anchor":
            return dict(c.metadata, content=c.content)
    return None


# ---- Similarity helpers ------------------------------------------------------

def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _tokenize(text: str) -> List[str]:
    """Lowercase, strip punctuation, split into tokens for BM25."""
    import re
    return re.findall(r"[a-z0-9][-a-z0-9_]*[a-z0-9]|[a-z0-9]+", text.lower())


def _bm25_search(
    candidates: List[MemoryChunk],
    query: str,
    top_k: int,
) -> List[tuple]:
    """BM25 keyword search over candidate chunks, returns (chunk, score) pairs."""
    if not _HAS_BM25 or not candidates or not query:
        return []

    corpus = []
    for c in candidates:
        keys = c.metadata.get("fact_keys", [])
        text = c.content + " " + " ".join(keys)
        corpus.append(_tokenize(text))

    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(_tokenize(query))
    indexed = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
    return [(candidates[i], float(s)) for i, s in indexed[:top_k] if s > 0]


def _reciprocal_rank_fusion(
    *ranked_lists: List[tuple],
    k: int = 60,
) -> List[tuple]:
    """Merge multiple (chunk, score) ranked lists via RRF."""
    rrf_scores: Dict[str, float] = {}
    chunk_map: Dict[str, Any] = {}

    for ranked in ranked_lists:
        for rank, (chunk, _score) in enumerate(ranked):
            cid = chunk.metadata.get("id", id(chunk))
            rrf_scores[cid] = rrf_scores.get(cid, 0.0) + 1.0 / (k + rank + 1)
            chunk_map[cid] = chunk

    sorted_ids = sorted(rrf_scores, key=lambda x: rrf_scores[x], reverse=True)
    return [(chunk_map[cid], rrf_scores[cid]) for cid in sorted_ids]


# ---- Temporal filtering ------------------------------------------------------

def _temporal_filter(
    candidates: List[MemoryChunk],
    time_point: Optional[str],
) -> List[MemoryChunk]:
    """Keep only facts valid at a given time point."""
    if not time_point:
        return candidates
    filtered = []
    for c in candidates:
        if c.metadata.get("type") != "fact":
            filtered.append(c)
            continue
        vf = c.metadata.get("valid_from")
        vu = c.metadata.get("valid_until")
        if vf and vf > time_point:
            continue
        if vu and vu <= time_point:
            continue
        filtered.append(c)
    return filtered


# ---- Graph enrichment -------------------------------------------------------

def enrich_with_graph(
    results: List[Dict[str, Any]],
    graph_hops: int = 2,
    graph_filters: Optional[Dict[str, Any]] = None,
    max_total: int = 40,
) -> List[Dict[str, Any]]:
    """Enrich retrieval results with graph-connected facts via PageRank walk.

    ``max_total`` caps the combined result size (seeds + enriched) to prevent
    oversized responses.
    """
    from openmind import graph as graph_module

    if graph_hops <= 0:
        return results

    seed_ids = [
        r["id"] for r in results
        if r.get("id") and r.get("type") == "fact"
    ]
    if not seed_ids:
        return results

    scores = graph_module.pagerank_walk(seed_ids, max_hops=graph_hops)

    existing_ids = {r["id"] for r in results if r.get("id")}
    new_ids = {fid: score for fid, score in scores.items() if fid not in existing_ids}

    enriched: List[tuple] = []
    _ensure_loaded()
    for c in _CHUNKS:
        cid = c.metadata.get("id")
        if cid in new_ids:
            if not c.metadata.get("is_latest", True):
                continue
            enriched.append((_to_result(c, new_ids[cid]), new_ids[cid]))

    enriched.sort(key=lambda x: x[1], reverse=True)
    budget = max(0, max_total - len(results))
    for item, _ in enriched[:budget]:
        results.append(item)

    return results


# ---- Result formatting -------------------------------------------------------

def _to_result(chunk: MemoryChunk, score: float = 0.0) -> Dict[str, Any]:
    return {
        "id": chunk.metadata.get("id"),
        "content": chunk.content,
        "role": chunk.metadata.get("role", "user"),
        "score": score,
        "timestamp": chunk.metadata.get("timestamp"),
        "type": chunk.metadata.get("type", "episode"),
    }


def _deduplicate_results(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicate results based on content hash, keeping the highest-scored copy."""
    import hashlib
    seen: Dict[str, int] = {}
    deduped: List[Dict[str, Any]] = []
    for r in results:
        h = hashlib.sha256((r.get("content") or "").encode("utf-8")).hexdigest()[:16]
        if h in seen:
            idx = seen[h]
            if r.get("score", 0) > deduped[idx].get("score", 0):
                deduped[idx] = r
            continue
        seen[h] = len(deduped)
        deduped.append(r)
    return deduped


def count_facts_in_session(session_id: str) -> int:
    """Number of fact chunks for ``session_id``."""
    _ensure_loaded()
    return sum(
        1
        for c in _CHUNKS
        if c.session_id == session_id and c.metadata.get("type") == "fact"
    )


def list_recent_episode_results(session_id: str, top_k: int = 10) -> List[Dict[str, Any]]:
    """Latest episodes in ``session_id`` (newest first), for validator probes."""
    _ensure_loaded()
    eps = [
        c
        for c in _CHUNKS
        if c.session_id == session_id and c.metadata.get("type") == "episode"
    ]
    eps.sort(key=lambda c: c.metadata.get("timestamp", ""), reverse=True)
    out = [_to_result(c) for c in eps[:top_k]]
    return enrich_with_graph(out)


def retrieve_chunks_by_ids(
    session_id: str,
    chunk_ids: List[str],
    top_k: int = 10,
) -> List[Dict[str, Any]]:
    """
    Return chunks in ``session_id`` whose metadata ``id`` is in ``chunk_ids``.
    Used for validator mode 0 (possession / recall probes).
    """
    _ensure_loaded()
    want = set(chunk_ids)
    out: List[Dict[str, Any]] = []
    for c in _CHUNKS:
        if c.session_id != session_id:
            continue
        cid = c.metadata.get("id")
        if cid in want:
            out.append(_to_result(c, 1.0))
        if len(out) >= top_k:
            break
    return enrich_with_graph(out)


# ---- Legacy single-pass retrieval -------------------------------------------

def retrieve(
    session_id: str,
    query: Optional[str],
    embedding: Optional[List[float]],
    top_k: int,
    filters: Dict[str, Any],
    as_of_timestamp: Optional[str] = None,
    version_id: Optional[str] = None,
    diff_since: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Single-pass retrieval (backward-compatible).

    Filters by session_id, applies metadata filters, ranks by cosine
    similarity or timestamp order.
    """
    _ensure_loaded()

    candidates = [c for c in _CHUNKS if c.session_id == session_id]

    for key, value in _chunk_metadata_filters(filters).items():
        candidates = [c for c in candidates if c.metadata.get(key) == value]

    candidates = _temporal_filter(candidates, as_of_timestamp)

    has_embedding = (
        embedding is not None
        and len(embedding) > 0
        and any(v != 0.0 for v in embedding[:10])
    )

    if not has_embedding or len(candidates) == 0:
        if query and _HAS_BM25 and candidates:
            bm25_ranked = _bm25_search(candidates, query, top_k)
            if bm25_ranked:
                base = [_to_result(c, score) for c, score in bm25_ranked[:top_k]]
                return _deduplicate_results(enrich_with_graph(base))

        candidates.sort(key=lambda c: c.metadata.get("timestamp", ""), reverse=True)
        base = [_to_result(c) for c in candidates[:top_k]]
        return _deduplicate_results(enrich_with_graph(base))

    q_vec = np.array(embedding, dtype=np.float32)
    cosine_ranked = [(c, _cosine_sim(q_vec, c.embedding)) for c in candidates]
    cosine_ranked.sort(key=lambda x: x[1], reverse=True)

    if query and _HAS_BM25:
        bm25_ranked = _bm25_search(candidates, query, top_k)
        fused = _reciprocal_rank_fusion(cosine_ranked[:top_k], bm25_ranked)
        base = [_to_result(c, score) for c, score in fused[:top_k]]
    else:
        base = [_to_result(c, score) for c, score in cosine_ranked[:top_k]]

    return _deduplicate_results(enrich_with_graph(base))


# ---- Two-phase smart retrieval -----------------------------------------------

def retrieve_smart(
    session_id: str,
    query: Optional[str],
    embedding: Optional[List[float]],
    top_k: int = 10,
    filters: Optional[Dict[str, Any]] = None,
    time_point: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Two-phase retrieval for maximum token reduction.

    Phase 1: Search facts (type=fact) by similarity/keyword
    Phase 2: Load source episodes for top fact hits + session anchor
    Returns: {"anchor": {...}, "facts": [...], "sources": [...]}
    """
    _ensure_loaded()
    filters = filters or {}

    all_session = [c for c in _CHUNKS if c.session_id == session_id]

    facts = [c for c in all_session if c.metadata.get("type") == "fact"]
    facts_after_latest = [c for c in facts if c.metadata.get("is_latest", True)]
    facts = facts_after_latest
    facts = _temporal_filter(facts, time_point)

    for key, value in _chunk_metadata_filters(filters).items():
        facts = [c for c in facts if c.metadata.get(key) == value]

    import logging
    _log = logging.getLogger("bittensor")

    has_embedding = (
        embedding is not None
        and len(embedding) > 0
        and any(v != 0.0 for v in embedding[:10])
    )

    # When no facts exist (e.g. extraction was skipped), search episodes directly.
    search_targets = facts
    if not search_targets:
        search_targets = [c for c in all_session if c.metadata.get("type") == "episode"]

    _log.info(
        f"[retrieve_smart] session={session_id!r} "
        f"total_chunks={len(_CHUNKS)} session_chunks={len(all_session)} "
        f"type_fact={len([c for c in all_session if c.metadata.get('type') == 'fact'])} "
        f"is_latest={len(facts_after_latest)} after_filters={len(facts)} "
        f"search_targets={len(search_targets)} "
        f"embedding={'yes' if has_embedding else 'no'} query={query!r:.60}"
    )

    fact_results: List[tuple] = []
    if has_embedding:
        q_vec = np.array(embedding, dtype=np.float32)
        cosine_ranked = [(c, _cosine_sim(q_vec, c.embedding)) for c in search_targets]
        cosine_ranked.sort(key=lambda x: x[1], reverse=True)

        if query and _HAS_BM25:
            bm25_ranked = _bm25_search(search_targets, query, top_k)
            fact_results = _reciprocal_rank_fusion(cosine_ranked[:top_k], bm25_ranked)
        else:
            fact_results = cosine_ranked
    else:
        if query and _HAS_BM25 and search_targets:
            bm25_ranked = _bm25_search(search_targets, query, top_k)
            fact_results = bm25_ranked if bm25_ranked else [(c, 0.0) for c in search_targets]
        else:
            search_targets.sort(key=lambda c: c.metadata.get("timestamp", ""), reverse=True)
            fact_results = [(c, 0.0) for c in search_targets]

    top_facts = fact_results[:top_k]

    fact_dicts = [_to_result(c, score) for c, score in top_facts]
    try:
        fact_dicts = enrich_with_graph(fact_dicts, graph_hops=2, max_total=top_k * 2)
    except Exception as _ge:
        logging.getLogger("bittensor").warning(
            f"[retrieve_smart] enrich_with_graph failed, skipping: {_ge}"
        )

    source_episode_ids = set()
    for c, _ in top_facts:
        src = c.metadata.get("source_episode_id")
        if src:
            source_episode_ids.add(src)

    source_limit = min(3, len(source_episode_ids))
    source_dicts = []
    seen_sources = set()
    for c in all_session:
        cid = c.metadata.get("id")
        if cid in source_episode_ids and cid not in seen_sources:
            source_dicts.append(_to_result(c))
            seen_sources.add(cid)
            if len(seen_sources) >= source_limit:
                break

    anchor_dict = None
    for c in all_session:
        if c.metadata.get("type") == "anchor":
            anchor_dict = _to_result(c)
            anchor_dict["intent"] = c.metadata.get("intent", "")
            anchor_dict["key_facts"] = c.metadata.get("key_facts", [])
            anchor_dict["key_decisions"] = c.metadata.get("key_decisions", [])
            break

    fact_dicts = _deduplicate_results(fact_dicts)
    source_dicts = _deduplicate_results(source_dicts)

    return [{
        "anchor": anchor_dict,
        "facts": fact_dicts,
        "sources": source_dicts,
        "fact_count": len(fact_dicts),
        "source_count": len(source_dicts),
    }]
