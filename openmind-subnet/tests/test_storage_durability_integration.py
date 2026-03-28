import os

from openmind.durability import RS_M, encode_rs_10_4, reconstruct_rs_10_4
from openmind.storage import load_shards, store_shards


def test_storage_and_durability_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENMIND_STORAGE_DIR", str(tmp_path / "storage"))

    data = os.urandom(2048)
    session_id = "integration-session"
    shard_id = "chunk-0"

    data_shards, parity_shards, padlen = encode_rs_10_4(data)
    all_shards = data_shards + parity_shards
    assert len(all_shards) == RS_M

    store_shards(session_id=session_id, shard_id=shard_id, shards=all_shards)

    loaded = load_shards(
        session_id=session_id,
        shard_id=shard_id,
        max_shards=RS_M,
    )

    reconstructed = reconstruct_rs_10_4(loaded, padlen)
    assert reconstructed == data
