"""
Shard storage and (future) encryption for OpenMind.

For the MVP this module provides simple local filesystem-based storage for
encoded shards. Encryption is left to a higher layer (utils.crypto), so this
module treats data as already-encrypted bytes.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

BASE_DIR = Path(os.environ.get("OPENMIND_STORAGE_DIR", ".openmind_storage")).expanduser()


def _session_dir(session_id: str) -> Path:
    return BASE_DIR / session_id


def store_shards(session_id: str, shard_id: str, shards: List[bytes]) -> None:
    """
    Persist a list of shards for a given session and shard identifier.

    Layout on disk:
        BASE_DIR/session_id/shard_id_<index>.bin
    """
    directory = _session_dir(session_id)
    directory.mkdir(parents=True, exist_ok=True)

    for idx, shard in enumerate(shards):
        path = directory / f"{shard_id}_{idx}.bin"
        with path.open("wb") as f:
            f.write(shard)


def load_shards(session_id: str, shard_id: str, max_shards: int) -> List[bytes]:
    """
    Load up to `max_shards` shards for a given session and shard identifier.

    Missing files are skipped; the returned list may be shorter than
    `max_shards`.
    """
    directory = _session_dir(session_id)
    shards: List[bytes] = []

    if not directory.exists():
        return shards

    for idx in range(max_shards):
        path = directory / f"{shard_id}_{idx}.bin"
        if path.exists():
            with path.open("rb") as f:
                shards.append(f.read())

    return shards

