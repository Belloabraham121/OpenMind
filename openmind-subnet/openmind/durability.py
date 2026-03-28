"""
Durability and Reed–Solomon erasure coding for OpenMind.

Uses ``zfec`` with k=10 data shares and m=14 total shares (4 parity).
Any 10 shares reconstruct the payload; up to 4 shares may be missing.

Chunk RS blobs are stored under ``OPENMIND_STORAGE_DIR/_rs/<chunk_id>/`` so
reconstruction can run with only ``chunk_id`` (no session path required).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from zfec import easyfec
from zfec.easyfec import div_ceil

from openmind.storage import BASE_DIR

RS_K = 10
RS_M = 14


def _safe_segment(s: str) -> str:
    return s.replace("/", "_").replace("..", "_")


def rs_chunk_dir(chunk_id: str) -> Path:
    return BASE_DIR / "_rs" / _safe_segment(chunk_id)


def canonical_chunk_bytes(
    session_id: str,
    content: str,
    embedding: List[float],
    metadata: Dict[str, Any],
) -> bytes:
    payload = {
        "session_id": session_id,
        "content": content,
        "embedding": embedding,
        "metadata": metadata,
    }
    return json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")


def encode_rs_blob(data: bytes) -> Tuple[List[bytes], int]:
    """
    Erasure-encode ``data`` into RS_M shares (RS_K data + RS_M - RS_K parity).

    Returns:
        (shares, padlen) for ``easyfec.Decoder.decode(..., padlen)``.
    """
    enc = easyfec.Encoder(RS_K, RS_M)
    shares = enc.encode(data)
    chunksize = div_ceil(len(data), RS_K)
    padlen = RS_K * chunksize - len(data)
    return list(shares), int(padlen)


def decode_rs_blob(shares: List[bytes], sharenums: List[int], padlen: int) -> bytes:
    """Reconstruct original bytes from any RS_K distinct shares."""
    if len(shares) != len(sharenums):
        raise ValueError("shares and sharenums length mismatch")
    if len(shares) < RS_K:
        raise ValueError(f"need at least {RS_K} shares, got {len(shares)}")
    pairs = sorted(zip(sharenums, shares), key=lambda x: x[0])
    sharenums_k = [p[0] for p in pairs[:RS_K]]
    shares_k = [p[1] for p in pairs[:RS_K]]
    dec = easyfec.Decoder(RS_K, RS_M)
    return dec.decode(shares_k, sharenums_k, padlen)


def persist_chunk_rs(
    session_id: str,
    content: str,
    embedding: List[float],
    metadata: Dict[str, Any],
) -> None:
    """Write erasure-coded shares + meta for a chunk (by metadata ``id``)."""
    chunk_id = (metadata or {}).get("id")
    if not chunk_id:
        return
    raw = canonical_chunk_bytes(session_id, content, embedding, metadata)
    shares, padlen = encode_rs_blob(raw)
    root = rs_chunk_dir(str(chunk_id))
    root.mkdir(parents=True, exist_ok=True)
    meta_path = root / "meta.json"
    meta_path.write_text(
        json.dumps({"padlen": padlen, "k": RS_K, "m": RS_M}, ensure_ascii=False),
        encoding="utf-8",
    )
    for i, block in enumerate(shares):
        (root / f"{i}.bin").write_bytes(block)


def load_rs_share_files(chunk_id: str) -> Tuple[List[Optional[bytes]], int]:
    """
    Load up to RS_M share files; missing indices return None.
    Returns (list indexed 0..RS_M-1, padlen).
    """
    root = rs_chunk_dir(str(chunk_id))
    meta_path = root / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"no RS meta for chunk {chunk_id}")

    padlen = int(json.loads(meta_path.read_text(encoding="utf-8"))["padlen"])
    out: List[Optional[bytes]] = [None] * RS_M
    for i in range(RS_M):
        p = root / f"{i}.bin"
        if p.exists():
            out[i] = p.read_bytes()
    return out, padlen


def reconstruct_chunk_rs(
    chunk_id: str,
    drop_indices: Optional[Set[int]] = None,
) -> Dict[str, Any]:
    """
    Rebuild the canonical chunk dict from on-disk shares, optionally simulating
    loss of shares listed in ``drop_indices``.
    """
    drop = drop_indices or set()
    shares_optional, padlen = load_rs_share_files(chunk_id)
    blocks: List[bytes] = []
    nums: List[int] = []
    for i in range(RS_M):
        if i in drop:
            continue
        b = shares_optional[i]
        if b is None:
            continue
        blocks.append(b)
        nums.append(i)
    if len(blocks) < RS_K:
        raise ValueError(
            f"not enough shares after drops: need {RS_K}, have {len(blocks)}"
        )
    raw = decode_rs_blob(blocks, nums, padlen)
    return json.loads(raw.decode("utf-8"))


# ---- Helpers matching classic "10+4" naming -----------------------------------

def encode_rs_10_4(data: bytes) -> Tuple[List[bytes], List[bytes], int]:
    """
    Encode ``data`` into 10 data + 4 parity shares (14 total).

    Returns ``(data_shards, parity_shards, padlen)``; pass ``padlen`` to
    ``reconstruct_rs_10_4``.
    """
    shares, padlen = encode_rs_blob(data)
    return shares[:RS_K], shares[RS_K:], padlen


def reconstruct_rs_10_4(
    shards: List[bytes],
    padlen: int,
) -> bytes:
    """
    Reconstruct from up to RS_M share slots (index = share id). Omit missing
    shares by passing ``b""`` placeholders **or** use a list of length RS_M.
    """
    if len(shards) != RS_M:
        raise ValueError(f"expected {RS_M} shard slots, got {len(shards)}")
    blocks: List[bytes] = []
    nums: List[int] = []
    for i, b in enumerate(shards):
        if b:
            blocks.append(b)
            nums.append(i)
    if len(blocks) < RS_K:
        raise ValueError(f"need at least {RS_K} non-empty shards, got {len(blocks)}")
    return decode_rs_blob(blocks, nums, padlen)

