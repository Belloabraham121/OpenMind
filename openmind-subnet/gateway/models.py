"""
Pydantic request / response models for the OpenMind REST gateway.

Every model maps 1-to-1 to the ``OpenMindRequest`` synapse fields so the
gateway can mechanically translate between HTTP JSON and Bittensor RPC.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class StoreRequest(BaseModel):
    session_id: str
    content: str
    role: str = "user"
    tier: str = "basic"
    event_at: Optional[str] = None
    multimodal_type: Optional[str] = None
    embedding: Optional[List[float]] = None
    filters: Dict[str, Any] = Field(default_factory=dict)
    shared_space_id: Optional[str] = None
    author: Optional[str] = None
    auth_metadata: Dict[str, Any] = Field(default_factory=dict)


class QueryRequest(BaseModel):
    session_id: str
    query: Optional[str] = None
    embedding: Optional[List[float]] = None
    top_k: int = 10
    smart: bool = True
    filters: Dict[str, Any] = Field(default_factory=dict)
    tier: str = "basic"
    multimodal_type: Optional[str] = None


class CompactRequest(BaseModel):
    session_id: str


class VersionRequest(BaseModel):
    session_id: str
    as_of_timestamp: Optional[str] = None
    version_id: Optional[str] = None
    diff_since: Optional[str] = None


class CheckpointSaveRequest(BaseModel):
    workflow_id: str
    step: int
    state: Dict[str, Any] = Field(default_factory=dict)


class CheckpointResumeRequest(BaseModel):
    workflow_id: str


class SharedSpaceQueryRequest(BaseModel):
    session_id: str
    shared_space_id: str
    query: Optional[str] = None
    embedding: Optional[List[float]] = None
    top_k: int = 10
    author: Optional[str] = None
    auth_metadata: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Response bodies
# ---------------------------------------------------------------------------

class MemoryResult(BaseModel):
    results: List[Dict[str, Any]] = Field(default_factory=list)
    anchor: Optional[Dict[str, Any]] = None
    facts: Optional[List[Dict[str, Any]]] = None
    sources: Optional[List[Dict[str, Any]]] = None
    version_diff: Optional[Dict[str, Any]] = None
    provenance_path: Optional[List[str]] = None
    checkpoint: Optional[Dict[str, Any]] = None
    token_estimate: Optional[int] = None


class HealthResponse(BaseModel):
    status: str
    subtensor: bool
    metagraph_n: int
    dendrite: bool
    validator_step: int
