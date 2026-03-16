"""
Versioning and Merkle-tree provenance for OpenMind.

This module maintains an in-memory chain of version metadata per session, with
simple Merkle-style hashing. It is sufficient for MVP time-travel semantics
and can later be backed by persistent storage.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


@dataclass
class Version:
    version_id: str
    timestamp: str
    author: Optional[str]
    change_reason: Optional[str]
    parent_version_id: Optional[str]
    payload_hash: str
    metadata: Dict[str, Any] = field(default_factory=dict)


_VERSIONS: Dict[str, List[Version]] = {}


def _hash_payload(payload: bytes, parent_version_id: Optional[str]) -> str:
    h = hashlib.sha256()
    if parent_version_id:
        h.update(parent_version_id.encode("utf-8"))
    h.update(payload)
    return h.hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_version(
    session_id: str,
    payload: bytes,
    author: Optional[str] = None,
    change_reason: Optional[str] = None,
    parent_version_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Version:
    """
    Create a new immutable version node for a given session.
    """
    payload_hash = _hash_payload(payload, parent_version_id)
    version = Version(
        version_id=payload_hash,
        timestamp=_now_iso(),
        author=author,
        change_reason=change_reason,
        parent_version_id=parent_version_id,
        payload_hash=payload_hash,
        metadata=metadata or {},
    )
    chain = _VERSIONS.setdefault(session_id, [])
    chain.append(version)
    return version


def get_version_chain(session_id: str) -> List[Version]:
    """
    Return the full version chain for a session in creation order.
    """
    return list(_VERSIONS.get(session_id, []))


def get_version_by_id(session_id: str, version_id: str) -> Optional[Version]:
    """
    Find a specific version in the session chain by ID.
    """
    for v in _VERSIONS.get(session_id, []):
        if v.version_id == version_id:
            return v
    return None


def diff_versions(
    session_id: str,
    from_version_id: Optional[str],
    to_version_id: str,
) -> Dict[str, Any]:
    """
    Compute a simple diff between two versions in the same session.

    For the MVP we only return the identifiers of added/removed versions in
    the chain between `from` and `to`.
    """
    chain = _VERSIONS.get(session_id, [])
    ids = [v.version_id for v in chain]

    if to_version_id not in ids:
        raise ValueError("to_version_id not found in chain")

    to_index = ids.index(to_version_id)

    if from_version_id is None:
        from_index = -1
    else:
        if from_version_id not in ids:
            raise ValueError("from_version_id not found in chain")
        from_index = ids.index(from_version_id)

    if from_index >= to_index:
        return {"added": [], "removed": []}

    added = ids[from_index + 1 : to_index + 1]
    removed: List[str] = []

    return {
        "added": added,
        "removed": removed,
    }

