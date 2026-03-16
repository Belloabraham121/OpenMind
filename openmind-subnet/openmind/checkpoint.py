"""
Workflow checkpointing for OpenMind.

Implements an in-memory JSON-like checkpoint store keyed by workflow_id and
step, matching the PRD's checkpoint structure.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional


@dataclass
class Checkpoint:
    workflow_id: str
    step: int
    timestamp: str
    state: Dict[str, Any]


_CHECKPOINTS: Dict[str, Dict[int, Checkpoint]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def save_checkpoint(
    workflow_id: str,
    step: int,
    state: Dict[str, Any],
) -> Checkpoint:
    """
    Save a checkpoint for a given workflow and step.
    """
    cp = Checkpoint(
        workflow_id=workflow_id,
        step=step,
        timestamp=_now_iso(),
        state=state,
    )
    workflow_map = _CHECKPOINTS.setdefault(workflow_id, {})
    workflow_map[step] = cp
    return cp


def load_checkpoint(
    workflow_id: str,
    step: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """
    Load a checkpoint for a given workflow.

    - If `step` is provided, load that exact step if it exists.
    - Otherwise, return the latest step for the workflow.
    """
    workflow_map = _CHECKPOINTS.get(workflow_id)
    if not workflow_map:
        return None

    if step is not None:
        cp = workflow_map.get(step)
        return None if cp is None else {
            "workflow_id": cp.workflow_id,
            "step": cp.step,
            "timestamp": cp.timestamp,
            "state": cp.state,
        }

    # Latest checkpoint by step.
    latest_step = max(workflow_map.keys())
    cp = workflow_map[latest_step]
    return {
        "workflow_id": cp.workflow_id,
        "step": cp.step,
        "timestamp": cp.timestamp,
        "state": cp.state,
    }

