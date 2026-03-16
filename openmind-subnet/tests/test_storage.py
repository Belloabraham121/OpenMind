import os

from openmind.storage import store_shards, load_shards, BASE_DIR


def test_store_and_load_shards(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENMIND_STORAGE_DIR", str(tmp_path / "storage"))

    session_id = "test-session"
    shard_id = "shard-1"
    shards = [os.urandom(128) for _ in range(5)]

    store_shards(session_id=session_id, shard_id=shard_id, shards=shards)

    loaded = load_shards(session_id=session_id, shard_id=shard_id, max_shards=5)
    assert loaded == shards

