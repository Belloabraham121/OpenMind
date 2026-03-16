"""
Validator scoring logic for OpenMind.

For the initial MVP, we use a very simple reward scheme modelled on the
template subnet:
- responses that are non-empty and well-formed receive reward 1.0
- others receive reward 0.0
"""

from __future__ import annotations

from typing import Any, Iterable, List

import numpy as np
import bittensor as bt


def reward(step: int, response: Any) -> float:
    """
    Compute a reward for a single miner response.

    This can be made more sophisticated later (e.g., measuring retrieval
    quality, latency, provenance completeness). For now, we reward responses
    that contain at least one result item.
    """
    if response is None:
        bt.logging.info(f"Reward: step={step}, response=None -> 0.0")
        return 0.0

    # Expecting OpenMindResponse or dict-like with 'results'.
    results = getattr(response, "results", None)
    if results is None and isinstance(response, dict):
        results = response.get("results")

    score = 1.0 if results else 0.0
    bt.logging.info(
        f"Reward: step={step}, results_len={len(results) if results is not None else 0} -> {score}"
    )
    return score


def get_rewards(step: int, responses: Iterable[Any]) -> np.ndarray:
    """
    Vectorised helper returning rewards for a batch of responses.
    """
    return np.array([reward(step, resp) for resp in responses], dtype=np.float32)

