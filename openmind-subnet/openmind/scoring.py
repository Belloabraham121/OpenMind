"""
Validator scoring logic for OpenMind.

Implements a composite reward model with both legacy dimensions (storage,
retrieval, versioning, checkpoint, latency) and new extraction-quality
dimensions (extraction count, extraction quality, relationship accuracy,
temporal accuracy).

For responses that do not expose these metrics, a simple fallback is used:
non-empty results → 1.0, otherwise 0.0.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping

import numpy as np
import bittensor as bt


ALPHA_STORAGE = 3.0
ALPHA_RETRIEVAL = 3.0
ALPHA_VERSION = 2.0
ALPHA_CHECKPOINT = 1.0
ALPHA_LATENCY = 1.0
ALPHA_EXTRACTION = 3.0
ALPHA_TEMPORAL = 2.0


def _extract_metrics(response: Any) -> dict:
    """
    Best-effort extraction of scoring metrics from a response.

    Supports both legacy and new extraction-quality metrics.
    """
    metrics = {}

    def get(name: str, default=None):
        if isinstance(response, Mapping) and name in response:
            return response[name]
        return getattr(response, name, default)

    metrics["storage_ok"] = bool(get("storage_ok", False))
    metrics["retrieval_recall"] = float(get("retrieval_recall", 0.0) or 0.0)
    metrics["version_ok"] = bool(get("version_ok", False))
    metrics["checkpoint_ok"] = bool(get("checkpoint_ok", False))
    metrics["latency_ms"] = float(get("latency_ms", 0.0) or 0.0)
    metrics["extraction_count"] = int(get("extraction_count", 0) or 0)
    metrics["extraction_quality"] = float(get("extraction_quality", 0.0) or 0.0)
    metrics["relationship_accuracy"] = float(get("relationship_accuracy", 0.0) or 0.0)
    metrics["temporal_accuracy"] = float(get("temporal_accuracy", 0.0) or 0.0)

    return metrics


def _score_extraction(count: int, cap: int = 10) -> float:
    """Score fact extraction count: more is better up to cap, then diminishing."""
    if count <= 0:
        return 0.0
    return min(1.0, count / cap)


def reward(step: int, response: Any) -> float:
    """
    Compute a reward for a single miner response.

    Uses a weighted combination of legacy + extraction metrics when available,
    otherwise falls back to non-empty results check.
    """
    if response is None:
        bt.logging.info(f"Reward: step={step}, response=None -> 0.0")
        return 0.0

    metrics = _extract_metrics(response)

    has_legacy = any([
        metrics["storage_ok"],
        metrics["retrieval_recall"] > 0.0,
        metrics["version_ok"],
        metrics["checkpoint_ok"],
        metrics["latency_ms"] > 0.0,
    ])

    has_extraction = any([
        metrics["extraction_count"] > 0,
        metrics["extraction_quality"] > 0.0,
        metrics["relationship_accuracy"] > 0.0,
        metrics["temporal_accuracy"] > 0.0,
    ])

    if has_legacy or has_extraction:
        r_storage = 1.0 if metrics["storage_ok"] else 0.0
        r_retrieval = max(0.0, min(1.0, metrics["retrieval_recall"]))
        r_version = 1.0 if metrics["version_ok"] else 0.0
        r_checkpoint = 1.0 if metrics["checkpoint_ok"] else 0.0
        latency_ms = metrics["latency_ms"]
        r_latency = max(0.0, 1.0 - latency_ms / 2000.0)
        r_extraction = _score_extraction(metrics["extraction_count"])
        r_ext_quality = max(0.0, min(1.0, metrics["extraction_quality"]))
        r_rel_accuracy = max(0.0, min(1.0, metrics["relationship_accuracy"]))
        r_temporal = max(0.0, min(1.0, metrics["temporal_accuracy"]))

        r_extraction_combined = (
            0.3 * r_extraction
            + 0.3 * r_ext_quality
            + 0.2 * r_rel_accuracy
            + 0.2 * r_temporal
        ) if has_extraction else 0.0

        num = (
            ALPHA_STORAGE * r_storage
            + ALPHA_RETRIEVAL * r_retrieval
            + ALPHA_VERSION * r_version
            + ALPHA_CHECKPOINT * r_checkpoint
            + ALPHA_LATENCY * r_latency
            + ALPHA_EXTRACTION * r_extraction_combined
            + ALPHA_TEMPORAL * r_temporal
        )
        den = (
            ALPHA_STORAGE
            + ALPHA_RETRIEVAL
            + ALPHA_VERSION
            + ALPHA_CHECKPOINT
            + ALPHA_LATENCY
            + ALPHA_EXTRACTION
            + ALPHA_TEMPORAL
        )
        score = float(num / den)
        bt.logging.info(f"Reward(step={step}) with metrics -> {score:.4f}")
        return score

    results = getattr(response, "results", None)
    if results is None and isinstance(response, Mapping):
        results = response.get("results")

    score = 1.0 if results else 0.0
    bt.logging.info(
        f"Reward(step={step}) fallback, results_len={len(results) if results is not None else 0} -> {score}"
    )
    return score


def get_rewards(step: int, responses: Iterable[Any]) -> np.ndarray:
    """Vectorised helper returning rewards for a batch of responses."""
    return np.array([reward(step, resp) for resp in responses], dtype=np.float32)
