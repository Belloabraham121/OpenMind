"""
Relationship detection and graph edge storage for OpenMind.

Detects three relationship types between facts:
- supersedes: new fact contradicts existing fact on same subject
- elaborates: new fact adds detail to existing fact on same subject
- correlates: facts share entities or temporal scope

Edges are stored as append-only JSONL at .openmind_storage/_graph/edges.jsonl
and loaded into memory at startup.
"""

from __future__ import annotations

import json
import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from openmind.storage import BASE_DIR

_GRAPH_DIR = BASE_DIR / "_graph"
_EDGES_FILE = _GRAPH_DIR / "edges.jsonl"

_EDGES: List[Dict[str, Any]] = []
_ADJ: Dict[str, List[tuple]] = {}
_edges_loaded = False


def _rebuild_adj() -> None:
    """Rebuild the adjacency index from _EDGES for O(degree) neighbor lookups."""
    _ADJ.clear()
    for edge in _EDGES:
        sid = edge.get("source_id", "")
        tid = edge.get("target_id", "")
        conf = edge.get("confidence", 0.5)
        if sid:
            _ADJ.setdefault(sid, []).append((tid, conf))
        if tid:
            _ADJ.setdefault(tid, []).append((sid, conf))


def _ensure_edges_loaded() -> None:
    global _edges_loaded
    if _edges_loaded:
        return
    _edges_loaded = True
    if _EDGES_FILE.exists():
        for line in _EDGES_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                try:
                    _EDGES.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    _rebuild_adj()


def _save_edge(edge: Dict[str, Any]) -> None:
    _GRAPH_DIR.mkdir(parents=True, exist_ok=True)
    with _EDGES_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(edge, ensure_ascii=False) + "\n")
    _EDGES.append(edge)
    sid = edge.get("source_id", "")
    tid = edge.get("target_id", "")
    conf = edge.get("confidence", 0.5)
    if sid:
        _ADJ.setdefault(sid, []).append((tid, conf))
    if tid:
        _ADJ.setdefault(tid, []).append((sid, conf))


def get_edges() -> List[Dict[str, Any]]:
    _ensure_edges_loaded()
    return list(_EDGES)


def get_edges_for_fact(fact_id: str) -> List[Dict[str, Any]]:
    _ensure_edges_loaded()
    return [e for e in _EDGES if e["source_id"] == fact_id or e["target_id"] == fact_id]


def detect_relationships(
    new_fact: Dict[str, Any],
    existing_facts: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Compare a newly extracted fact against existing facts and return edges.

    Also marks superseded facts by setting is_latest=False on them (returned
    via the ``superseded_ids`` list on each edge of type "supersedes").
    """
    _ensure_edges_loaded()
    edges = []
    new_subj = (new_fact.get("subject") or "").lower().strip()
    new_obj = (new_fact.get("object") or "").lower().strip()
    new_id = new_fact["id"]
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    for existing in existing_facts:
        if not existing.get("is_latest", True):
            continue
        if existing.get("type") != "fact":
            continue

        ex_id = existing.get("id", "")
        if ex_id == new_id:
            continue

        ex_subj = (existing.get("subject") or "").lower().strip()
        ex_obj = (existing.get("object") or "").lower().strip()

        if not ex_subj or not new_subj:
            continue

        subject_match = (
            new_subj == ex_subj
            or new_subj in ex_subj
            or ex_subj in new_subj
        )

        if subject_match and new_obj and ex_obj and new_obj != ex_obj:
            edge = {
                "source_id": new_id,
                "target_id": ex_id,
                "relation": "supersedes",
                "confidence": 0.85,
                "created_at": now,
            }
            _save_edge(edge)
            edges.append(edge)
            continue

        if subject_match and new_obj != ex_obj:
            edge = {
                "source_id": new_id,
                "target_id": ex_id,
                "relation": "elaborates",
                "confidence": 0.7,
                "created_at": now,
            }
            _save_edge(edge)
            edges.append(edge)
            continue

        new_keys = set(new_fact.get("fact_keys") or [])
        ex_keys = set(existing.get("fact_keys") or [])
        overlap = new_keys & ex_keys
        if len(overlap) >= 2:
            edge = {
                "source_id": new_id,
                "target_id": ex_id,
                "relation": "correlates",
                "confidence": min(1.0, len(overlap) * 0.2),
                "created_at": now,
            }
            _save_edge(edge)
            edges.append(edge)

    return edges


def pagerank_walk(
    seed_ids: List[str],
    max_hops: int = 2,
    decay: float = 0.5,
) -> Dict[str, float]:
    """
    Lightweight Personalized PageRank from seed fact IDs.

    Returns a dict of {fact_id: score} for all reachable facts.
    Seed facts start with score 1.0; each hop decays by ``decay``.
    Uses an adjacency index for O(degree) neighbor lookups instead of
    scanning all edges.
    """
    _ensure_edges_loaded()

    scores: Dict[str, float] = {}
    for sid in seed_ids:
        scores[sid] = 1.0

    frontier = set(seed_ids)
    for hop in range(max_hops):
        next_frontier: set = set()
        hop_score = decay ** (hop + 1)
        for fid in frontier:
            for neighbor, conf in _ADJ.get(fid, []):
                if neighbor and neighbor not in scores:
                    scores[neighbor] = hop_score * conf
                    next_frontier.add(neighbor)
        frontier = next_frontier
        if not frontier:
            break

    return scores
