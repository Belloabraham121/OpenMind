import os

from openmind.durability import encode_rs_10_4, reconstruct_rs_10_4


def test_encode_and_reconstruct_roundtrip():
    data = os.urandom(1024)

    data_shards, parity_shards = encode_rs_10_4(data)
    assert len(data_shards) == 10
    assert len(parity_shards) == 4

    # Use only data shards to reconstruct.
    reconstructed = reconstruct_rs_10_4(data_shards + parity_shards)
    assert reconstructed == data

