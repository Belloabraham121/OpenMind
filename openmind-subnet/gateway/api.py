"""
FastAPI REST gateway for the OpenMind subnet.

Runs inside the validator process and translates HTTP requests into
``OpenMindRequest`` synapses that are forwarded to miners via Dendrite.
"""

import copy
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import bittensor as bt
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from openmind.protocol import OpenMindRequest
from openmind.utils.uids import get_random_uids

from gateway.models import (
    CheckpointResumeRequest,
    CheckpointSaveRequest,
    HealthResponse,
    MemoryResult,
    QueryRequest,
    SharedSpaceQueryRequest,
    StoreRequest,
    VersionRequest,
)


app = FastAPI(title="OpenMind Gateway", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_STATIC_DIR = Path(__file__).parent / "static"


@app.get("/", include_in_schema=False)
async def root():
    return FileResponse(_STATIC_DIR / "index.html")

# Injected by the validator at startup via ``configure()``.
_validator: Any = None
# A dedicated Dendrite + event loop for the gateway so the aiohttp session
# is created on the correct loop and asyncio.timeout() works properly.
_gw_dendrite: Any = None
_gw_loop: Any = None
_gw_thread: Any = None


def configure(validator: Any) -> None:
    """Bind a live ``Validator`` instance and spin up a gateway-local Dendrite."""
    import asyncio
    import threading

    global _validator, _gw_dendrite, _gw_loop, _gw_thread
    _validator = validator

    # Create a persistent background loop for gateway dendrite calls.
    _gw_loop = asyncio.new_event_loop()

    def _run_loop(loop: asyncio.AbstractEventLoop):
        asyncio.set_event_loop(loop)
        loop.run_forever()

    _gw_thread = threading.Thread(target=_run_loop, args=(_gw_loop,), daemon=True)
    _gw_thread.start()

    # Create Dendrite on that loop so its aiohttp session is properly bound.
    import concurrent.futures
    fut = concurrent.futures.Future()

    async def _make_dendrite():
        try:
            d = bt.Dendrite(wallet=validator.wallet)
            fut.set_result(d)
        except Exception as exc:
            fut.set_exception(exc)

    _gw_loop.call_soon_threadsafe(asyncio.ensure_future, _make_dendrite())
    _gw_dendrite = fut.result(timeout=10)


def _require_validator():
    if _validator is None:
        raise HTTPException(status_code=503, detail="Validator not initialised yet")
    if _validator.metagraph is None:
        raise HTTPException(status_code=503, detail="Metagraph unavailable")
    if _gw_dendrite is None:
        raise HTTPException(status_code=503, detail="Gateway dendrite unavailable")
    return _validator


_LOCAL_MINER_HOST = os.environ.get("OPENMIND_MINER_HOST", "127.0.0.1")
_LOCAL_MINER_PORT = int(os.environ.get("OPENMIND_MINER_PORT", "8091"))


def _patch_axons(axons: List[Any]) -> List[Any]:
    """Replace axons with port 0 (not served on-chain) with the known local miner."""
    patched = []
    for ax in axons:
        if getattr(ax, "port", 0) == 0:
            p = copy.deepcopy(ax)
            p.ip = _LOCAL_MINER_HOST
            p.port = _LOCAL_MINER_PORT
            patched.append(p)
        else:
            patched.append(ax)
    return patched


async def _query_miners(synapse: OpenMindRequest, k: int = 4) -> List[Any]:
    """Send a synapse to *k* randomly-selected miners and return responses."""
    import asyncio
    import concurrent.futures

    v = _require_validator()
    miner_uids = get_random_uids(v, k=min(k, int(v.metagraph.n)))
    if not miner_uids:
        return []
    axons = _patch_axons([v.metagraph.axons[uid] for uid in miner_uids])

    future = asyncio.run_coroutine_threadsafe(
        _gw_dendrite(
            axons=axons,
            synapse=synapse,
            deserialize=True,
            timeout=12.0,
        ),
        _gw_loop,
    )
    responses = await asyncio.get_event_loop().run_in_executor(
        None, future.result, 15.0
    )
    return responses


def _best_response(responses: List[Any]) -> MemoryResult:
    """Pick the response with the most results (simple heuristic)."""
    best: Optional[Any] = None
    best_count = -1
    for r in responses:
        results = getattr(r, "results", None) or []
        if len(results) > best_count:
            best = r
            best_count = len(results)
    if best is None:
        return MemoryResult()
    return MemoryResult(
        results=getattr(best, "results", []),
        version_diff=getattr(best, "version_diff", None),
        provenance_path=getattr(best, "provenance_path", None),
        checkpoint=getattr(best, "checkpoint", None),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/v1/memory/store", response_model=MemoryResult)
async def memory_store(body: StoreRequest):
    """Store a memory chunk on the subnet."""
    synapse = OpenMindRequest(
        session_id=body.session_id,
        query=body.content,
        embedding=body.embedding,
        filters={**body.filters, "_action": "store", "_role": body.role},
        tier=body.tier,
        multimodal_type=body.multimodal_type,
        shared_space_id=body.shared_space_id,
        author=body.author,
        auth_metadata=body.auth_metadata,
    )
    responses = await _query_miners(synapse)
    return _best_response(responses)


@app.post("/v1/memory/query", response_model=MemoryResult)
async def memory_query(body: QueryRequest):
    """Search and retrieve memories from the subnet."""
    synapse = OpenMindRequest(
        session_id=body.session_id,
        query=body.query,
        embedding=body.embedding,
        top_k=body.top_k,
        filters=body.filters,
        tier=body.tier,
        multimodal_type=body.multimodal_type,
    )
    responses = await _query_miners(synapse)
    return _best_response(responses)


@app.post("/v1/memory/version", response_model=MemoryResult)
async def memory_version(body: VersionRequest):
    """Time-travel or diff memory versions."""
    synapse = OpenMindRequest(
        session_id=body.session_id,
        as_of_timestamp=body.as_of_timestamp,
        version_id=body.version_id,
        diff_since=body.diff_since,
    )
    responses = await _query_miners(synapse)
    return _best_response(responses)


@app.post("/v1/checkpoint/save", response_model=MemoryResult)
async def checkpoint_save(body: CheckpointSaveRequest):
    """Save a workflow checkpoint."""
    synapse = OpenMindRequest(
        session_id=f"checkpoint-{body.workflow_id}",
        workflow_id=body.workflow_id,
        query=f"checkpoint-step-{body.step}",
        filters={"_action": "checkpoint_save", "step": body.step, "state": body.state},
    )
    responses = await _query_miners(synapse)
    return _best_response(responses)


@app.post("/v1/checkpoint/resume", response_model=MemoryResult)
async def checkpoint_resume(body: CheckpointResumeRequest):
    """Resume from the latest checkpoint for a workflow."""
    synapse = OpenMindRequest(
        session_id=f"checkpoint-{body.workflow_id}",
        workflow_id=body.workflow_id,
        resume_from_checkpoint=True,
    )
    responses = await _query_miners(synapse)
    return _best_response(responses)


@app.post("/v1/space/query", response_model=MemoryResult)
async def space_query(body: SharedSpaceQueryRequest):
    """Query a shared memory space."""
    synapse = OpenMindRequest(
        session_id=body.session_id,
        query=body.query,
        embedding=body.embedding,
        top_k=body.top_k,
        shared_space_id=body.shared_space_id,
        author=body.author,
        auth_metadata=body.auth_metadata,
    )
    responses = await _query_miners(synapse)
    return _best_response(responses)


@app.get("/v1/health", response_model=HealthResponse)
async def health():
    """Health check — reports validator connectivity status."""
    if _validator is None:
        return HealthResponse(
            status="starting",
            subtensor=False,
            metagraph_n=0,
            dendrite=False,
            validator_step=0,
        )
    return HealthResponse(
        status="ok",
        subtensor=_validator.subtensor is not None,
        metagraph_n=int(_validator.metagraph.n) if _validator.metagraph else 0,
        dendrite=_validator.dendrite is not None,
        validator_step=_validator.step,
    )
