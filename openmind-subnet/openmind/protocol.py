"""
Synapse and protocol definitions for the OpenMind subnet.

This module defines the request / response structures described in the PRD:
- session-scoped memory requests
- time-travel and versioning controls
- workflow checkpointing
- shared memory spaces and access control metadata
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import bittensor as bt


class OpenMindRequest(bt.Synapse):
    """
    Core OpenMind protocol request.

    This is the type sent over Bittensor dendrite/axon. It carries both the
    query parameters and (after miner processing) the response payload.
    """

    # ---- Core query fields ----
    session_id: str
    query: Optional[str] = None
    embedding: Optional[List[float]] = None
    top_k: int = 10
    filters: Dict[str, Any] = {}

    # ---- Temporal grounding ----
    event_at: Optional[str] = None  # ISO 8601 — when the described event occurred

    # ---- Time-travel / versioning ----
    as_of_timestamp: Optional[str] = None  # ISO 8601
    version_id: Optional[str] = None
    diff_since: Optional[str] = None  # version_id or timestamp

    # ---- Workflow checkpointing ----
    workflow_id: Optional[str] = None
    resume_from_checkpoint: bool = False

    # ---- Shared spaces / access control ----
    shared_space_id: Optional[str] = None
    author: Optional[str] = None  # wallet address or agent identifier
    auth_metadata: Dict[str, Any] = {}

    # ---- Multimodal hints ----
    multimodal_type: Optional[str] = None  # "text" | "image" | "pdf"

    # ---- Miner-filled response fields ----
    results: List[Dict[str, Any]] = []
    version_diff: Optional[Dict[str, Any]] = None
    provenance_path: Optional[List[str]] = None
    checkpoint: Optional[Dict[str, Any]] = None
    version_ok: bool = False
    checkpoint_ok: bool = False

    def deserialize(self) -> "OpenMindResponse":
        """
        Convert the synapse into a lightweight response object for validators.
        """
        return OpenMindResponse(
            results=self.results,
            version_diff=self.version_diff,
            provenance_path=self.provenance_path,
            checkpoint=self.checkpoint,
            version_ok=bool(getattr(self, "version_ok", False)),
            checkpoint_ok=bool(getattr(self, "checkpoint_ok", False)),
        )


@dataclass
class OpenMindResponse:
    """
    High-level response object returned to validators / clients after
    deserialization of an OpenMindRequest.
    """

    results: List[Dict[str, Any]] = field(default_factory=list)
    version_diff: Optional[Dict[str, Any]] = None
    provenance_path: Optional[List[str]] = None
    checkpoint: Optional[Dict[str, Any]] = None
    version_ok: bool = False
    checkpoint_ok: bool = False

