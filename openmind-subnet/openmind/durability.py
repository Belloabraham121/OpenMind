"""
Durability and Reed-Solomon erasure coding scaffolding for OpenMind.

This module will wrap libraries such as `reedsolo` and later `zfec` /
`liberasurecode` behind a stable interface.
"""


def encode_shards(*_args, **_kwargs):
    """Placeholder for RS encoding."""
    raise NotImplementedError("Durability encoding not implemented yet.")


def reconstruct_from_shards(*_args, **_kwargs):
    """Placeholder for RS reconstruction."""
    raise NotImplementedError("Durability reconstruction not implemented yet.")


