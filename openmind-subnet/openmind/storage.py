"""
Persistent chunk storage for OpenMind.

Stores memory chunks as JSON files on disk, one file per chunk, organised by
session_id.  This replaces the volatile in-memory ``_CHUNKS`` list so data
survives miner restarts.

Layout::

    BASE_DIR/
      <session_id>/
        <chunk_id>.json      # one file per stored chunk

Each JSON file contains::

    {
        "session_id": "...",
        "content": "...",
        "embedding": [0.1, 0.2, ...],
        "metadata": { "id": "...", "role": "user", "timestamp": "...", ... }
    }

Environment variable ``OPENMIND_STORAGE_DIR`` controls the root directory
(default: ``.openmind_storage`` relative to the working directory).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(
    os.environ.get("OPENMIND_STORAGE_DIR", ".openmind_storage")
).expanduser()


def _session_dir(session_id: str) -> Path:
    safe = session_id.replace("/", "_").replace("..", "_")
    return BASE_DIR / safe


def _shard_group_dir(session_id: str, shard_group_id: str) -> Path:
    sess = _session_dir(session_id)
    safe_gid = shard_group_id.replace("/", "_").replace("..", "_")
    return sess / "_shards" / safe_gid


def store_shards(
    session_id: str,
    shard_id: str,
    shards: List[bytes],
) -> Path:
    """Persist numbered binary shards ``0..len-1`` for tests / tooling."""
    directory = _shard_group_dir(session_id, shard_id)
    directory.mkdir(parents=True, exist_ok=True)
    for i, blob in enumerate(shards):
        (directory / f"{i}.bin").write_bytes(blob)
    return directory


def load_shards(
    session_id: str,
    shard_id: str,
    max_shards: int,
) -> List[bytes]:
    """Load shards ``0 .. max_shards-1``; missing files become ``b''``."""
    directory = _shard_group_dir(session_id, shard_id)
    out: List[bytes] = []
    for i in range(max_shards):
        path = directory / f"{i}.bin"
        out.append(path.read_bytes() if path.exists() else b"")
    return out


def store_chunk(
    session_id: str,
    chunk_id: str,
    content: str,
    embedding: List[float],
    metadata: Dict[str, Any],
) -> Path:
    """Persist a single chunk to disk and return the file path."""
    directory = _session_dir(session_id)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{chunk_id}.json"
    payload = {
        "session_id": session_id,
        "content": content,
        "embedding": embedding,
        "metadata": metadata,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def load_chunk(session_id: str, chunk_id: str) -> Optional[Dict[str, Any]]:
    """Load a single chunk by ID.  Returns ``None`` if not found."""
    path = _session_dir(session_id) / f"{chunk_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_session_chunks(session_id: str) -> List[Dict[str, Any]]:
    """Load every chunk for a session, sorted by timestamp (oldest first)."""
    directory = _session_dir(session_id)
    if not directory.exists():
        return []

    chunks: List[Dict[str, Any]] = []
    for path in directory.glob("*.json"):
        try:
            chunks.append(json.loads(path.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            continue

    chunks.sort(key=lambda c: c.get("metadata", {}).get("timestamp", ""))
    return chunks


def load_all_chunks() -> List[Dict[str, Any]]:
    """Load every chunk across all sessions (used at miner startup)."""
    if not BASE_DIR.exists():
        return []

    chunks: List[Dict[str, Any]] = []
    for session_dir in BASE_DIR.iterdir():
        if not session_dir.is_dir():
            continue
        for path in session_dir.glob("*.json"):
            try:
                chunks.append(json.loads(path.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, OSError):
                continue

    chunks.sort(key=lambda c: c.get("metadata", {}).get("timestamp", ""))
    return chunks


def delete_chunk(session_id: str, chunk_id: str) -> bool:
    """Delete a single chunk.  Returns True if it existed."""
    path = _session_dir(session_id) / f"{chunk_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False


def session_ids() -> List[str]:
    """Return a list of all session IDs that have stored data."""
    if not BASE_DIR.exists():
        return []
    return [
        d.name for d in BASE_DIR.iterdir()
        if d.is_dir() and d.name != "_graph" and any(d.glob("*.json"))
    ]


def update_chunk_metadata(
    session_id: str,
    chunk_id: str,
    updates: Dict[str, Any],
) -> bool:
    """Patch metadata fields on an existing chunk. Returns True on success."""
    path = _session_dir(session_id) / f"{chunk_id}.json"
    if not path.exists():
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        meta = data.get("metadata", {})
        meta.update(updates)
        data["metadata"] = meta
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return True
    except (json.JSONDecodeError, OSError):
        return False
