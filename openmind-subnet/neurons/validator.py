"""
Validator entrypoint for the OpenMind subnet.

This module wires the validator to the OpenMind protocol types. Core validation
and scoring logic will be implemented separately.
"""

from typing import NoReturn

from openmind.protocol import OpenMindRequest, OpenMindResponse


def build_request() -> OpenMindRequest:
    """
    Construct a placeholder OpenMindRequest that a real validator forward
    loop would send to miners.
    """
    raise NotImplementedError("Validator request construction not implemented yet.")


def handle_response(_response: OpenMindResponse) -> None:
    """
    Placeholder hook to process miner responses, update scores, and set weights.
    """
    raise NotImplementedError("Validator response handling not implemented yet.")


def run() -> NoReturn:
    """
    Placeholder validator runner.

    This will eventually bootstrap the Bittensor validator loop, construct
    `OpenMindRequest` objects via `build_request`, query miners, and pass
    `OpenMindResponse` objects into `handle_response`.
    """
    raise NotImplementedError("Validator logic not implemented yet.")

