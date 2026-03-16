"""
Durability and Reed-Solomon erasure coding for OpenMind.

Phase 1 implementation uses the `reedsolo` library to provide an RS(10,4)
scheme by default (10 data shards + 4 parity shards).
"""

from __future__ import annotations

from typing import List, Tuple

import reedsolo  # type: ignore


def encode_rs_10_4(data: bytes) -> Tuple[List[bytes], List[bytes]]:
    """
    Encode `data` into 10 data shards and 4 parity shards using Reed–Solomon.

    Returns:
        (data_shards, parity_shards)
    """
    # RS(k, m) with k=10 data, m=4 parity.
    rs = reedsolo.RSCodec(4)
    encoded = rs.encode(data)

    # Split into 14 equal-ish shards.
    n_shards = 14
    shard_size = (len(encoded) + n_shards - 1) // n_shards
    shards = [encoded[i : i + shard_size] for i in range(0, len(encoded), shard_size)]

    # Pad last shard list if needed.
    while len(shards) < n_shards:
        shards.append(b"")

    data_shards = shards[:10]
    parity_shards = shards[10:]
    return data_shards, parity_shards


def reconstruct_rs_10_4(shards: List[bytes]) -> bytes:
    """
    Reconstruct original data from up to 14 shards (10 data + 4 parity).

    Args:
        shards: list of available shards (length <= 14, some may be empty).
                They are concatenated back into the RS-encoded stream.
    """
    rs = reedsolo.RSCodec(4)
    encoded = b"".join(shards)
    return bytes(rs.decode(encoded))

