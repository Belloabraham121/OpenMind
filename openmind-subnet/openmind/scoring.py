"""
Validator scoring logic for OpenMind.

Implements a composite reward model inspired by the PRD:
- storage / durability correctness
- retrieval quality
- versioning / time-travel correctness
- checkpoint correctness
- latency

For responses that do not expose these metrics, a simple fallback is used:
non-empty results → 1.0, otherwise 0.0.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping

import numpy as np
import bittensor as bt


# Weights for different sub-metrics, loosely reflecting PRD priorities.
ALPHA_STORAGE = 3.0
ALPHA_RETRIEVAL = 3.0
ALPHA_VERSION = 2.0
ALPHA_CHECKPOINT = 1.0
ALPHA_LATENCY = 1.0


def _extract_metrics(response: Any) -> dict:
    """
    Best-effort extraction of scoring metrics from a response.

    Expected optional fields (either as attributes or dict keys):
    - storage_ok: bool
    - retrieval_recall: float in [0,1]
    - version_ok: bool
    - checkpoint_ok: bool
    - latency_ms: float
    """
    metrics = {}

    # Allow both attribute-style and dict-style access.
    def get(name: str, default=None):
        if isinstance(response, Mapping) and name in response:
            return response[name]
        return getattr(response, name, default)

    metrics["storage_ok"] = bool(get("storage_ok", False))
    metrics["retrieval_recall"] = float(get("retrieval_recall", 0.0) or 0.0)
    metrics["version_ok"] = bool(get("version_ok", False))
    metrics["checkpoint_ok"] = bool(get("checkpoint_ok", False))
    metrics["latency_ms"] = float(get("latency_ms", 0.0) or 0.0)

    return metrics


def reward(step: int, response: Any) -> float:
    """
    Compute a reward for a single miner response.

    If rich metrics are present, use a weighted combination of:
    - storage_ok ∈ {0,1}
    - retrieval_recall ∈ [0,1]
    - version_ok ∈ {0,1}
    - checkpoint_ok ∈ {0,1}
    - latency bonus ∈ [0,1]

    Otherwise, fall back to: non-empty results → 1.0, else 0.0.
    """
    if response is None:
        bt.logging.info(f"Reward: step={step}, response=None -> 0.0")
        return 0.0

    metrics = _extract_metrics(response)
    has_rich_metrics = any(
        [
            metrics["storage_ok"],
            metrics["retrieval_recall"] > 0.0,
            metrics["version_ok"],
            metrics["checkpoint_ok"],
            metrics["latency_ms"] > 0.0,
        ]
    )

    if has_rich_metrics:
        # Map booleans to floats.
        r_storage = 1.0 if metrics["storage_ok"] else 0.0
        r_retrieval = max(0.0, min(1.0, metrics["retrieval_recall"]))
        r_version = 1.0 if metrics["version_ok"] else 0.0
        r_checkpoint = 1.0 if metrics["checkpoint_ok"] else 0.0

        # Simple latency bonus: 1 at 0 ms, 0 at or beyond 2000 ms.
        latency_ms = metrics["latency_ms"]
        r_latency = max(0.0, 1.0 - latency_ms / 2000.0)

        num = (
            ALPHA_STORAGE * r_storage
            + ALPHA_RETRIEVAL * r_retrieval
            + ALPHA_VERSION * r_version
            + ALPHA_CHECKPOINT * r_checkpoint
            + ALPHA_LATENCY * r_latency
        )
        den = (
            ALPHA_STORAGE
            + ALPHA_RETRIEVAL
            + ALPHA_VERSION
            + ALPHA_CHECKPOINT
            + ALPHA_LATENCY
        )
        score = float(num / den)
        bt.logging.info(f"Reward(step={step}) with rich metrics -> {score}")
        return score

    # Fallback: reward any non-empty results.
    results = getattr(response, "results", None)
    if results is None and isinstance(response, Mapping):
        results = response.get("results")

    score = 1.0 if results else 0.0
    bt.logging.info(
        f"Reward(step={step}) fallback, results_len={len(results) if results is not None else 0} -> {score}"
    )
    return score


def get_rewards(step: int, responses: Iterable[Any]) -> np.ndarray:
    """
    Vectorised helper returning rewards for a batch of responses.
    """
    return np.array([reward(step, resp) for resp in responses], dtype=np.float32)

