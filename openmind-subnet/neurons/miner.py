"""
Miner entrypoint for the OpenMind subnet.

This module wires the miner to the OpenMind protocol types. Core mining logic,
including storage, durability, and retrieval integration, will be implemented
separately.
"""

from typing import NoReturn

from openmind.protocol import OpenMindRequest, OpenMindResponse


def handle_request(_request: OpenMindRequest) -> OpenMindResponse:
    """
    Placeholder handler that demonstrates the miner's contract with the
    OpenMind protocol types.
    """
    raise NotImplementedError("Miner request handling not implemented yet.")


def run() -> NoReturn:
    """
    Placeholder miner runner.

    This will eventually bootstrap the Bittensor axon and route incoming
    `OpenMindRequest` instances to `handle_request`.
    """
    raise NotImplementedError("Miner logic not implemented yet.")

