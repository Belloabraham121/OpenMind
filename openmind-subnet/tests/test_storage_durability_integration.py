import os

from openmind.durability import encode_rs_10_4, reconstruct_rs_10_4
from openmind.storage import store_shards, load_shards


def test_storage_and_durability_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENMIND_STORAGE_DIR", str(tmp_path / "storage"))

    data = os.urandom(2048)
    session_id = "integration-session"
    shard_id = "chunk-0"

    data_shards, parity_shards = encode_rs_10_4(data)
    all_shards = data_shards + parity_shards

    store_shards(session_id=session_id, shard_id=shard_id, shards=all_shards)

    loaded_shards = load_shards(
        session_id=session_id,
        shard_id=shard_id,
        max_shards=len(all_shards),
    )

    reconstructed = reconstruct_rs_10_4(loaded_shards)
    assert reconstructed == data

