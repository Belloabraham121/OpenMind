"""
FastAPI REST gateway for the OpenMind subnet.

Runs inside the validator process and translates HTTP requests into
``OpenMindRequest`` synapses that are forwarded to miners via Dendrite.
"""

import copy
import hashlib
import logging
import os
import time
from contextlib import asynccontextmanager
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
    ChatRequest,
    ChatResponse,
    CheckpointResumeRequest,
    CheckpointSaveRequest,
    CompactRequest,
    HealthResponse,
    MemoryResult,
    QueryRequest,
    SharedSpaceQueryRequest,
    StoreRequest,
    VersionRequest,
)

from openmind.extraction import extract_temporal

from neurons.env_config import localnet_patch_axons_enabled


@asynccontextmanager
async def _gateway_lifespan(app: FastAPI):
    """Log key routes once; helps confirm the process picked up the latest ``api.py``."""
    logging.getLogger("uvicorn.error").info(
        "OpenMind gateway: GET /v1/subnet/quality (and /v1/network/quality) — restart validator after pulling gateway changes."
    )
    yield


app = FastAPI(
    title="OpenMind Gateway",
    version="0.1.0",
    lifespan=_gateway_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_STATIC_DIR = Path(__file__).parent / "static"

# Rotates with ``Validator.step % len(CHALLENGE_MODES)`` — keep in sync with neurons/validator.py
CHALLENGE_MODES: List[Dict[str, Any]] = [
    {
        "id": 0,
        "key": "retrieval",
        "label": "Retrieval recall",
        "description": "Ground-truth chunk recall against validator-held probes.",
    },
    {
        "id": 1,
        "key": "storage",
        "label": "Storage fidelity",
        "description": "Structured memory results present for durability probes.",
    },
    {
        "id": 2,
        "key": "versioning",
        "label": "Version & checkpoint",
        "description": "Version and checkpoint consistency signals.",
    },
    {
        "id": 3,
        "key": "extraction",
        "label": "Reconstruction (extraction)",
        "description": "Fact extraction signals in retrieval responses over observed subnet memory.",
    },
    {
        "id": 4,
        "key": "temporal",
        "label": "Temporal accuracy",
        "description": "Temporal structure in retrieved chunks (e.g. stored episodes with time context).",
    },
]


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
_chat_env_loaded = False


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


def _load_gateway_env_once() -> None:
    """Load gateway/.env once if OPENAI_API_KEY isn't present in process env."""
    global _chat_env_loaded
    if _chat_env_loaded:
        return
    _chat_env_loaded = True
    if os.environ.get("OPENAI_API_KEY"):
        return

    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return

    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if s.startswith("export "):
                s = s[len("export "):]
            if "=" not in s:
                continue
            k, v = s.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v
    except Exception:
        # Non-fatal: endpoint will return a clean config error.
        return


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
_DEFAULT_SHARD_SIZE = int(os.environ.get("OPENMIND_DETERMINISTIC_SHARD_SIZE", "4"))
_QUERY_ALL_MINERS = os.environ.get("OPENMIND_QUERY_ALL_MINERS", "false").lower() == "true"


def _patch_axons(axons: List[Any]) -> List[Any]:
    """When localnet patch is enabled, route ALL axons to the local miner.

    On testnet/mainnet the metagraph advertises external IPs that are
    unreachable from a dev machine, so we redirect every axon to the
    locally-running miner.  Since all patched axons resolve to the same
    host:port we deduplicate to a single axon to avoid overwhelming the
    miner with N identical concurrent connections.
    Entries that are None (unregistered slots) are silently skipped.
    """
    if not localnet_patch_axons_enabled():
        return [ax for ax in axons if ax is not None]
    template = None
    for ax in axons:
        if ax is not None:
            template = ax
            break
    if template is None:
        return []
    p = copy.deepcopy(template)
    p.ip = _LOCAL_MINER_HOST
    p.port = _LOCAL_MINER_PORT
    return [p]


def _eligible_miner_uids(v: Any, exclude_self: bool = True) -> List[int]:
    n = int(v.metagraph.n)
    uids = list(range(n))
    if not exclude_self:
        return uids

    try:
        own_hotkey = v.wallet.hotkey.ss58_address
        return [uid for uid in uids if v.metagraph.hotkeys[uid] != own_hotkey]
    except Exception:
        return uids


def _deterministic_uids(v: Any, session_id: str, k: int) -> List[int]:
    """
    Deterministically select miner UIDs for a session namespace.

    Uses a stable hash ring over eligible UIDs so reads/writes for the same
    session tend to hit the same shard set.
    """
    eligible = _eligible_miner_uids(v, exclude_self=True)
    if not eligible:
        return []

    k = min(max(1, int(k)), len(eligible))
    if k >= len(eligible):
        return list(eligible)

    scored: List[tuple[int, int]] = []
    for uid in eligible:
        digest = hashlib.sha256(f"{session_id}:{uid}".encode("utf-8")).digest()
        score = int.from_bytes(digest[:8], byteorder="big", signed=False)
        scored.append((uid, score))
    scored.sort(key=lambda t: t[1])
    return [uid for uid, _ in scored[:k]]


def _select_miner_uids(v: Any, synapse: OpenMindRequest, k: int) -> List[int]:
    session_id = getattr(synapse, "session_id", None)

    if _QUERY_ALL_MINERS:
        return _eligible_miner_uids(v, exclude_self=True)

    target_k = min(k, int(v.metagraph.n))
    if isinstance(session_id, str) and session_id.strip():
        shard_k = min(max(1, _DEFAULT_SHARD_SIZE), int(v.metagraph.n))
        target_k = min(max(target_k, shard_k), int(v.metagraph.n))
        return _deterministic_uids(v, session_id=session_id, k=target_k)

    return get_random_uids(v, k=target_k)


async def _query_miners(synapse: OpenMindRequest, k: int = 4) -> List[Any]:
    """Send a synapse to selected miners and return responses."""
    import asyncio

    v = _require_validator()
    miner_uids = _select_miner_uids(v, synapse=synapse, k=k)
    if not miner_uids:
        return []
    axons = _patch_axons([v.metagraph.axons[uid] for uid in miner_uids])

    try:
        future = asyncio.run_coroutine_threadsafe(
            _gw_dendrite(
                axons=axons,
                synapse=synapse,
                deserialize=False,
                timeout=30.0,
            ),
            _gw_loop,
        )
        raw_responses = await asyncio.get_event_loop().run_in_executor(
            None, future.result, 35.0
        )
    except (TimeoutError, Exception) as exc:
        bt.logging.warning(
            f"[GW _query_miners] dendrite call failed ({type(exc).__name__}): {exc}"
        )
        return []

    if not isinstance(raw_responses, list):
        raw_responses = [raw_responses]

    responses = []
    for r in raw_responses:
        if hasattr(r, "deserialize"):
            responses.append(r.deserialize())
        else:
            responses.append(r)

    return responses


async def _call_openai_chat(model: str, prompt: str) -> str:
    """Call OpenAI-compatible chat endpoint using server-side env credentials."""
    import httpx

    _load_gateway_env_once()
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY not configured in server environment or gateway/.env",
        )

    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 400,
        "messages": [
            {"role": "system", "content": "You are a concise assistant integrated with OpenMind memory."},
            {"role": "user", "content": prompt},
        ],
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"OpenAI API error: {resp.text[:400]}")
        data = resp.json()
        return (data.get("choices", [{}])[0].get("message", {}).get("content", "") or "").strip()


def _expand_time_references(query: Optional[str]) -> tuple:
    """Resolve relative time expressions in a query. Returns (expanded_query, resolved_date)."""
    if not query:
        return query, None
    resolved = extract_temporal(query)
    if resolved:
        return f"{query} [resolved: {resolved}]", resolved
    return query, None


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    try:
        import tiktoken
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception:
        return max(1, len(text) // 4)


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


def _result_identity(item: Dict[str, Any]) -> str:
    rid = item.get("id")
    if isinstance(rid, str) and rid:
        return f"id:{rid}"
    content = item.get("content")
    if isinstance(content, str) and content:
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        return f"content:{digest}"
    return f"fallback:{hashlib.sha256(str(item).encode('utf-8')).hexdigest()}"


def _merge_plain_results(responses: List[Any], top_k: int) -> List[Dict[str, Any]]:
    merged: Dict[str, Dict[str, Any]] = {}
    for r in responses:
        items = getattr(r, "results", None) or []
        if not isinstance(items, list):
            continue
        for idx, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            key = _result_identity(item)
            prev = merged.get(key)
            rank_bonus = max(0.0, 1.0 - (idx * 0.05))
            score = float(item.get("score", 0.0) or 0.0) + rank_bonus
            if prev is None:
                candidate = dict(item)
                candidate["_merge_votes"] = 1
                candidate["_merge_score"] = score
                merged[key] = candidate
                continue

            prev["_merge_votes"] = int(prev.get("_merge_votes", 1)) + 1
            prev["_merge_score"] = max(float(prev.get("_merge_score", 0.0)), score)
            # Prefer whichever representation has richer content.
            if (
                len(str(item.get("content", ""))) > len(str(prev.get("content", "")))
                and isinstance(item.get("content"), str)
            ):
                for k0, v0 in item.items():
                    if k0 not in ("_merge_votes", "_merge_score"):
                        prev[k0] = v0

    ranked = sorted(
        merged.values(),
        key=lambda x: (
            -int(x.get("_merge_votes", 1)),
            -float(x.get("_merge_score", 0.0)),
            str(x.get("timestamp", "")),
        ),
    )

    out: List[Dict[str, Any]] = []
    for item in ranked[: max(1, top_k)]:
        clean = dict(item)
        clean.pop("_merge_votes", None)
        clean.pop("_merge_score", None)
        out.append(clean)
    return out


def _dedupe_by_identity(items: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
    seen: set[str] = set()
    out: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        key = _result_identity(item)
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= top_k:
            break
    return out


def _merge_smart_results(responses: List[Any], top_k: int) -> Dict[str, Any]:
    anchors: List[Dict[str, Any]] = []
    facts: List[Dict[str, Any]] = []
    sources: List[Dict[str, Any]] = []

    for idx, r in enumerate(responses):
        payload = getattr(r, "results", None) or []
        bt.logging.info(
            f"[GW _merge_smart] resp[{idx}] type={type(r).__name__} "
            f"payload_len={len(payload)} payload_types={[type(x).__name__ for x in payload[:3]]}"
        )
        if not isinstance(payload, list) or not payload:
            continue
        first = payload[0]
        if not isinstance(first, dict):
            bt.logging.warning(
                f"[GW _merge_smart] resp[{idx}] first item not dict: {type(first).__name__}"
            )
            continue
        bt.logging.info(
            f"[GW _merge_smart] resp[{idx}] first keys={list(first.keys())} "
            f"facts={len(first.get('facts') or [])} sources={len(first.get('sources') or [])}"
        )
        if "anchor" in first and isinstance(first["anchor"], dict):
            anchors.append(first["anchor"])
        facts.extend([f for f in (first.get("facts") or []) if isinstance(f, dict)])
        sources.extend([s for s in (first.get("sources") or []) if isinstance(s, dict)])

    anchor = anchors[0] if anchors else None
    dedup_facts = _dedupe_by_identity(facts, top_k=max(1, top_k))
    dedup_sources = _dedupe_by_identity(sources, top_k=min(max(1, top_k), 8))
    return {
        "anchor": anchor,
        "facts": dedup_facts,
        "sources": dedup_sources,
        "fact_count": len(dedup_facts),
        "source_count": len(dedup_sources),
    }


def _merge_query_response(
    responses: List[Any],
    *,
    top_k: int,
    smart: bool,
) -> MemoryResult:
    if not responses:
        return MemoryResult()

    if smart:
        merged_smart = _merge_smart_results(responses, top_k=max(1, top_k))
        result = MemoryResult(results=[merged_smart])
        result.anchor = merged_smart.get("anchor")
        result.facts = merged_smart.get("facts")
        result.sources = merged_smart.get("sources")

        all_text = ""
        if result.anchor:
            all_text += str(result.anchor.get("content", "")) + " "
        for f in (result.facts or []):
            all_text += str(f.get("content", "")) + " "
        for s in (result.sources or []):
            all_text += str(s.get("content", "")) + " "
        result.token_estimate = _estimate_tokens(all_text)
        return result

    merged = _merge_plain_results(responses, top_k=max(1, top_k))
    return MemoryResult(results=merged)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/v1/memory/store", response_model=MemoryResult)
async def memory_store(body: StoreRequest):
    """Store a memory chunk on the subnet with automatic fact extraction."""
    synapse = OpenMindRequest(
        session_id=body.session_id,
        query=body.content,
        embedding=body.embedding,
        event_at=body.event_at,
        filters={**body.filters, "_action": "store", "_role": body.role},
        multimodal_type=body.multimodal_type,
        shared_space_id=body.shared_space_id,
        author=body.author,
        auth_metadata=body.auth_metadata,
    )
    responses = await _query_miners(synapse)
    result = _best_response(responses)
    if _validator is not None:
        _validator.register_store_results_from_gateway(
            result.results, body.session_id
        )
    return result


@app.post("/v1/memory/query", response_model=MemoryResult)
async def memory_query(body: QueryRequest):
    """Search and retrieve memories. Uses two-phase smart retrieval by default."""
    expanded_query, resolved_time = _expand_time_references(body.query)

    action = "_action"
    filters = dict(body.filters)
    if body.smart:
        filters[action] = "query_smart"
    if resolved_time:
        filters["_resolved_time"] = resolved_time

    synapse = OpenMindRequest(
        session_id=body.session_id,
        query=expanded_query,
        embedding=body.embedding,
        top_k=body.top_k,
        as_of_timestamp=resolved_time,
        filters=filters,
        multimodal_type=body.multimodal_type,
    )
    responses = await _query_miners(synapse)

    _resp_detail = []
    for _i, _r in enumerate(responses):
        _items = getattr(_r, "results", None) or []
        _resp_detail.append(f"resp[{_i}]={len(_items)} items")
    bt.logging.info(
        f"[GW query] session={body.session_id!r} query={body.query!r:.80} "
        f"smart={body.smart} top_k={body.top_k} resolved_time={resolved_time} "
        f"n_responses={len(responses)} detail={_resp_detail}"
    )

    return _merge_query_response(
        responses,
        top_k=body.top_k,
        smart=bool(body.smart),
    )


@app.post("/v1/memory/compact", response_model=MemoryResult)
async def memory_compact(body: CompactRequest):
    """Trigger session anchor compaction."""
    synapse = OpenMindRequest(
        session_id=body.session_id,
        filters={"_action": "compact"},
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


@app.post("/v1/chat/respond", response_model=ChatResponse)
async def chat_respond(body: ChatRequest):
    """
    Generate an assistant response using server-side OpenAI credentials and
    OpenMind retrieval context.
    """
    # 1) Retrieve memory context from subnet
    expanded_query, resolved_time = _expand_time_references(body.user_message)
    synapse = OpenMindRequest(
        session_id=body.session_id,
        query=expanded_query,
        top_k=body.top_k,
        as_of_timestamp=resolved_time,
        filters={"_action": "query_smart"},
    )
    responses = await _query_miners(synapse)
    result = _merge_query_response(
        responses,
        top_k=body.top_k,
        smart=True,
    )

    anchor = None
    facts: List[Dict[str, Any]] = []
    sources: List[Dict[str, Any]] = []
    if result.results and isinstance(result.results[0], dict):
        smart_data = result.results[0]
        if "facts" in smart_data:
            anchor = smart_data.get("anchor")
            facts = smart_data.get("facts") or []
            sources = smart_data.get("sources") or []

    # 2) Build prompt
    ctx_parts: List[str] = []
    if anchor and isinstance(anchor, dict):
        a = anchor.get("content", "")
        if a:
            ctx_parts.append("Session anchor:\n" + a)
    if facts:
        lines = [f"- {f.get('content','')}" for f in facts[:20] if f.get("content")]
        if lines:
            ctx_parts.append("Facts:\n" + "\n".join(lines))
    if sources:
        lines = [f"- {(s.get('content','') or '')[:400]}" for s in sources[:8]]
        if lines:
            ctx_parts.append("Source snippets:\n" + "\n".join(lines))

    context_text = "\n\n".join([p for p in ctx_parts if p]).strip()
    prompt = (
        "Use only the provided memory context and user message.\n"
        "If memory is insufficient, say what is missing.\n\n"
        f"Memory context:\n{context_text or '(none)'}\n\n"
        f"User:\n{body.user_message}"
    )

    # 3) Call model with server-side key
    response_text = await _call_openai_chat(body.model, prompt)
    return ChatResponse(
        response=response_text,
        model=body.model,
        token_estimate=_estimate_tokens(context_text),
    )


def _subnet_quality_payload() -> Dict[str, Any]:
    """EMA leaderboard and challenge focus from the live validator (if configured)."""
    if _validator is None:
        return {
            "configured": False,
            "validator_step": 0,
            "metagraph_n": 0,
            "sample_size": 0,
            "leaderboard": [],
            "challenge_modes": CHALLENGE_MODES,
            "current_challenge": None,
        }

    v = _validator
    mg = v.metagraph
    step = int(getattr(v, "step", 0))
    sample_size = int(getattr(v, "sample_size", 4))
    modes = CHALLENGE_MODES
    current = modes[step % len(modes)] if modes else None

    leaderboard: List[Dict[str, Any]] = []
    if mg is not None:
        n = int(mg.n)
        scores = getattr(v, "scores", []) or []
        for uid in range(n):
            try:
                hk = str(mg.hotkeys[uid])
            except Exception:
                hk = ""
            preview = hk[:12] + "…" if len(hk) > 12 else hk
            ema = float(scores[uid]) if uid < len(scores) else 0.0
            leaderboard.append(
                {
                    "uid": uid,
                    "hotkey_preview": preview,
                    "ema_score": round(ema, 4),
                }
            )
        leaderboard.sort(key=lambda row: -float(row["ema_score"]))

    return {
        "configured": True,
        "validator_step": step,
        "metagraph_n": int(mg.n) if mg is not None else 0,
        "sample_size": sample_size,
        "leaderboard": leaderboard[:96],
        "challenge_modes": modes,
        "current_challenge": current,
    }


def _durability_payload() -> Dict[str, Any]:
    """
    Durability score from validator challenge outcomes (not UI heuristics).
    Uses recent mode 1/2/5 samples:
      - mode 1: storage_ok
      - mode 2: version_ok, checkpoint_ok
      - mode 5: rs_reconstruction_ok
    """
    if _validator is None:
        return {
            "configured": False,
            "durability_score": None,
            "window_samples": 0,
            "components": {},
        }

    samples = getattr(_validator, "_durability_samples", []) or []
    recent = samples[-120:]

    storage_vals: List[float] = []
    version_vals: List[float] = []
    checkpoint_vals: List[float] = []
    rs_vals: List[float] = []

    for sample in recent:
        mode = int(sample.get("mode", -1))
        metrics = sample.get("metrics", [])
        if not isinstance(metrics, list):
            continue
        if mode == 1:
            for m in metrics:
                if isinstance(m, dict):
                    storage_vals.append(1.0 if bool(m.get("storage_ok")) else 0.0)
        elif mode == 2:
            for m in metrics:
                if isinstance(m, dict):
                    version_vals.append(1.0 if bool(m.get("version_ok")) else 0.0)
                    checkpoint_vals.append(1.0 if bool(m.get("checkpoint_ok")) else 0.0)
        elif mode == 5:
            for m in metrics:
                if isinstance(m, dict) and "rs_reconstruction_ok" in m:
                    rs_vals.append(1.0 if bool(m.get("rs_reconstruction_ok")) else 0.0)

    def _avg(vals: List[float]) -> Optional[float]:
        if not vals:
            return None
        return sum(vals) / float(len(vals))

    components = {
        "storage_pass_rate": _avg(storage_vals),
        "version_pass_rate": _avg(version_vals),
        "checkpoint_pass_rate": _avg(checkpoint_vals),
        "reconstruction_pass_rate": _avg(rs_vals),
    }

    weighted_parts: List[tuple[float, float]] = []
    if components["storage_pass_rate"] is not None:
        weighted_parts.append((0.45, components["storage_pass_rate"]))
    if components["version_pass_rate"] is not None:
        weighted_parts.append((0.20, components["version_pass_rate"]))
    if components["checkpoint_pass_rate"] is not None:
        weighted_parts.append((0.20, components["checkpoint_pass_rate"]))
    if components["reconstruction_pass_rate"] is not None:
        weighted_parts.append((0.15, components["reconstruction_pass_rate"]))

    if weighted_parts:
        num = sum(w * v for w, v in weighted_parts)
        den = sum(w for w, _ in weighted_parts)
        durability_score = round((num / den) * 100.0, 1)
    else:
        durability_score = None

    return {
        "configured": True,
        "durability_score": durability_score,
        "window_samples": len(recent),
        "components": {
            "storage_pass_rate": components["storage_pass_rate"],
            "version_pass_rate": components["version_pass_rate"],
            "checkpoint_pass_rate": components["checkpoint_pass_rate"],
            "reconstruction_pass_rate": components["reconstruction_pass_rate"],
            "storage_observations": len(storage_vals),
            "version_observations": len(version_vals),
            "checkpoint_observations": len(checkpoint_vals),
            "reconstruction_observations": len(rs_vals),
        },
    }


@app.get("/v1/subnet/quality")
@app.get("/v1/network/quality")
async def subnet_quality():
    """
    Miner EMA scores (composite reward) and validator challenge rotation.
    Used by the dashboard Network Quality view.
    """
    return _subnet_quality_payload()


@app.get("/v1/subnet/durability")
@app.get("/v1/network/durability")
async def subnet_durability():
    """Durability telemetry derived from live validator challenge outcomes."""
    return _durability_payload()


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
