import os

import pytest

from openmind.durability import (
    RS_M,
    encode_rs_10_4,
    encode_rs_blob,
    persist_chunk_rs,
    reconstruct_chunk_rs,
    reconstruct_rs_10_4,
)


def test_encode_and_reconstruct_roundtrip():
    data = os.urandom(1024)

    data_shards, parity_shards, padlen = encode_rs_10_4(data)
    assert len(data_shards) == 10
    assert len(parity_shards) == 4

    merged = data_shards + parity_shards
    assert len(merged) == RS_M
    reconstructed = reconstruct_rs_10_4(merged, padlen)
    assert reconstructed == data


def test_tolerates_four_missing_parity_shards():
    data = os.urandom(4096)
    data_shards, parity_shards, padlen = encode_rs_10_4(data)
    merged = data_shards + parity_shards
    # Drop all four parity shares (indices 10–13); only data shares remain.
    partial = list(merged)
    partial[10] = b""
    partial[11] = b""
    partial[12] = b""
    partial[13] = b""
    assert reconstruct_rs_10_4(partial, padlen) == data


def test_tolerates_four_missing_mixed_shards():
    data = b"mixed-loss-pattern-bytes"
    enc, padlen = encode_rs_blob(data)
    slots = list(enc)
    # Remove shares 3, 7, 11, 12 — still 10 left.
    for i in (3, 7, 11, 12):
        slots[i] = b""
    assert reconstruct_rs_10_4(slots, padlen) == data


def test_persist_and_reconstruct_chunk_with_parity_drops(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENMIND_STORAGE_DIR", str(tmp_path / "st"))

    session_id = "s1"
    meta = {"id": "chunk-abc", "type": "episode", "timestamp": "t0"}
    persist_chunk_rs(
        session_id=session_id,
        content="hello rs",
        embedding=[0.1, 0.2],
        metadata=meta,
    )
    out = reconstruct_chunk_rs("chunk-abc", drop_indices={10, 11, 12, 13})
    assert out["content"] == "hello rs"
    assert out["session_id"] == session_id


def test_persist_not_called_without_id(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENMIND_STORAGE_DIR", str(tmp_path / "st"))
    persist_chunk_rs(
        session_id="s",
        content="x",
        embedding=[],
        metadata={"type": "episode"},
    )
    with pytest.raises(FileNotFoundError):
        reconstruct_chunk_rs("missing", drop_indices=set())
