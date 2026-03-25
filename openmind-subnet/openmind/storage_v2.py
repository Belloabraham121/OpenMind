"""
SQLite-backed per-session storage for OpenMind.

This module keeps one SQLite database per session:

    OPENMIND_STORAGE_DIR/<session_id>/store.sqlite

It exposes a compatibility API with storage.py so retrieval/miner code can
switch backends with minimal changes.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(
    os.environ.get("OPENMIND_STORAGE_DIR", ".openmind_storage")
).expanduser()


def _session_dir(session_id: str) -> Path:
    safe = session_id.replace("/", "_").replace("..", "_")
    return BASE_DIR / safe


def _db_path(session_id: str) -> Path:
    return _session_dir(session_id) / "store.sqlite"


def _connect(session_id: str) -> sqlite3.Connection:
    directory = _session_dir(session_id)
    directory.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_db_path(session_id)))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    _ensure_schema(conn)
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chunks (
            chunk_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding_json TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            timestamp TEXT
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chunks_ts ON chunks(timestamp)"
    )
    conn.commit()


def store_chunk(
    session_id: str,
    chunk_id: str,
    content: str,
    embedding: List[float],
    metadata: Dict[str, Any],
) -> Path:
    """Persist a single chunk into the session SQLite file."""
    conn = _connect(session_id)
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO chunks
                (chunk_id, session_id, content, embedding_json, metadata_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                chunk_id,
                session_id,
                content,
                json.dumps(embedding, ensure_ascii=False),
                json.dumps(metadata, ensure_ascii=False),
                (metadata or {}).get("timestamp"),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return _db_path(session_id)


def load_chunk(session_id: str, chunk_id: str) -> Optional[Dict[str, Any]]:
    """Load a single chunk by ID. Returns None if not found."""
    path = _db_path(session_id)
    if not path.exists():
        return None
    conn = _connect(session_id)
    try:
        row = conn.execute(
            """
            SELECT session_id, content, embedding_json, metadata_json
            FROM chunks
            WHERE chunk_id = ?
            """,
            (chunk_id,),
        ).fetchone()
        if row is None:
            return None
        return {
            "session_id": row[0],
            "content": row[1],
            "embedding": json.loads(row[2] or "[]"),
            "metadata": json.loads(row[3] or "{}"),
        }
    finally:
        conn.close()


def load_session_chunks(session_id: str) -> List[Dict[str, Any]]:
    """Load every chunk for a session, sorted by timestamp (oldest first)."""
    path = _db_path(session_id)
    if not path.exists():
        return []

    conn = _connect(session_id)
    try:
        rows = conn.execute(
            """
            SELECT session_id, content, embedding_json, metadata_json
            FROM chunks
            ORDER BY COALESCE(timestamp, '')
            """
        ).fetchall()
    finally:
        conn.close()

    out: List[Dict[str, Any]] = []
    for row in rows:
        try:
            out.append(
                {
                    "session_id": row[0],
                    "content": row[1],
                    "embedding": json.loads(row[2] or "[]"),
                    "metadata": json.loads(row[3] or "{}"),
                }
            )
        except json.JSONDecodeError:
            continue
    return out


def load_all_chunks() -> List[Dict[str, Any]]:
    """Load every chunk across all sessions."""
    if not BASE_DIR.exists():
        return []

    chunks: List[Dict[str, Any]] = []
    for session_dir in BASE_DIR.iterdir():
        if not session_dir.is_dir():
            continue
        db_file = session_dir / "store.sqlite"
        if not db_file.exists():
            continue
        chunks.extend(load_session_chunks(session_dir.name))

    chunks.sort(key=lambda c: c.get("metadata", {}).get("timestamp", ""))
    return chunks


def delete_chunk(session_id: str, chunk_id: str) -> bool:
    """Delete a single chunk. Returns True if it existed."""
    path = _db_path(session_id)
    if not path.exists():
        return False
    conn = _connect(session_id)
    try:
        cur = conn.execute(
            "DELETE FROM chunks WHERE chunk_id = ?",
            (chunk_id,),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def session_ids() -> List[str]:
    """Return session IDs that have sqlite-backed data."""
    if not BASE_DIR.exists():
        return []
    out: List[str] = []
    for d in BASE_DIR.iterdir():
        if not d.is_dir() or d.name == "_graph":
            continue
        if (d / "store.sqlite").exists():
            out.append(d.name)
    return out


def update_chunk_metadata(
    session_id: str,
    chunk_id: str,
    updates: Dict[str, Any],
) -> bool:
    """Patch metadata fields on an existing chunk. Returns True on success."""
    path = _db_path(session_id)
    if not path.exists():
        return False
    conn = _connect(session_id)
    try:
        row = conn.execute(
            "SELECT metadata_json FROM chunks WHERE chunk_id = ?",
            (chunk_id,),
        ).fetchone()
        if row is None:
            return False
        try:
            metadata = json.loads(row[0] or "{}")
        except json.JSONDecodeError:
            metadata = {}
        metadata.update(updates or {})
        conn.execute(
            """
            UPDATE chunks
            SET metadata_json = ?, timestamp = ?
            WHERE chunk_id = ?
            """,
            (
                json.dumps(metadata, ensure_ascii=False),
                metadata.get("timestamp"),
                chunk_id,
            ),
        )
        conn.commit()
        return True
    finally:
        conn.close()
