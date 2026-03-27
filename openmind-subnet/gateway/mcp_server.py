"""
MCP (Model Context Protocol) server for the OpenMind subnet.

This wraps the REST gateway so any MCP-compatible AI agent (Claude Desktop,
Cursor, LangGraph, etc.) can connect with a single endpoint and gain access
to OpenMind's decentralised memory layer.

**Direct validator** (local dev when Next.js is not used):

    python -m gateway.mcp_server --api-url http://localhost:8090

**Next.js BFF** (recommended): HTTP calls go to the web app with
``Authorization: Bearer om_live_…``; the app proxies to ``SUBNET_GATEWAY_URL``.

    python -m gateway.mcp_server --bff-url http://localhost:3000 --api-key om_live_...

    # Or: export OPENMIND_API_KEY=om_live_...

Claude Desktop config example (BFF mode):

    {
      "mcpServers": {
        "openmind": {
          "command": "python",
          "args": [
            "-m",
            "gateway.mcp_server",
            "--bff-url",
            "http://localhost:3000",
            "--api-key",
            "<paste from dashboard API & MCP>"
          ]
        }
      }
    }
"""

import argparse
import json
import os
from typing import Any, Dict, List, Optional

import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("OpenMind")

# Validator OpenAPI paths -> Next.js ``/api/gateway/*`` paths (must stay in sync with the app).
_GATEWAY_TO_BFF: Dict[str, str] = {
    "/v1/memory/store": "/api/gateway/memory/store",
    "/v1/memory/query": "/api/gateway/memory/query",
    "/v1/memory/compact": "/api/gateway/memory/compact",
    "/v1/memory/version": "/api/gateway/memory/version",
    "/v1/checkpoint/save": "/api/gateway/checkpoint/save",
    "/v1/checkpoint/resume": "/api/gateway/checkpoint/resume",
    "/v1/space/query": "/api/gateway/space/query",
    "/v1/health": "/api/gateway/health",
}

_bff_url: Optional[str] = None
_api_key: Optional[str] = None
_api_url: str = "http://localhost:8090"


def _resolved_path(gateway_path: str) -> str:
    if _bff_url:
        mapped = _GATEWAY_TO_BFF.get(gateway_path)
        if not mapped:
            raise ValueError(
                f"No BFF route mapped for {gateway_path!r}. "
                "Use --api-url for direct validator access."
            )
        return mapped
    return gateway_path


def _base_url() -> str:
    if _bff_url:
        return _bff_url.rstrip("/")
    return _api_url.rstrip("/")


def _http_headers() -> Dict[str, str]:
    if _api_key:
        return {"Authorization": f"Bearer {_api_key}"}
    return {}


def _full_url(gateway_path: str) -> str:
    return f"{_base_url()}{_resolved_path(gateway_path)}"


async def _post(path: str, payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(_full_url(path), json=payload, headers=_http_headers())
        resp.raise_for_status()
        return resp.json()


async def _get(path: str) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(_full_url(path), headers=_http_headers())
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def openmind_store(
    content: str,
    session_id: Optional[str] = None,
    role: str = "user",
    event_at: Optional[str] = None,
    multimodal_type: Optional[str] = None,
) -> str:
    """Store a memory chunk in the OpenMind decentralised memory layer.

    Automatically extracts atomic facts, detects temporal expressions,
    and builds relationship graphs between facts.

    Args:
        session_id: Namespace for this memory (must match Memory Explorer).
            If omitted, and you are running in **Next.js BFF mode** (``--bff-url``), the app will
            derive the correct namespace from your authenticated API key.
            In **direct validator mode** (no ``--bff-url``), ``session_id`` is required.
        content: The text content to store.
        role: Who produced the content — "user", "assistant", or "system".
        event_at: ISO-8601 timestamp of when the described event occurred (optional).
        multimodal_type: Optional — "text", "image", or "pdf".
    """
    payload: dict = {
        "content": content,
        "role": role,
        "event_at": event_at,
        "multimodal_type": multimodal_type,
    }
    if session_id:
        payload["session_id"] = session_id
    elif not _bff_url:
        raise ValueError("session_id is required in direct validator mode; use --bff-url or pass session_id.")

    result = await _post("/v1/memory/store", payload)
    return json.dumps(result, indent=2)


@mcp.tool()
async def openmind_query(
    query: str,
    session_id: Optional[str] = None,
    top_k: int = 10,
    smart: bool = True,
) -> str:
    """Search and retrieve memories from the OpenMind memory layer.

    Uses two-phase smart retrieval by default: searches atomic facts first,
    then loads source episodes and the session anchor for maximum token reduction.

    Args:
        session_id: Same namespace as ``openmind_store``.
            If omitted, and you are running in **Next.js BFF mode** (``--bff-url``), the app will
            derive the correct namespace from your authenticated API key.
            In **direct validator mode** (no ``--bff-url``), ``session_id`` is required.
        query: Natural language search query.
        top_k: Maximum number of results to return.
        smart: Use two-phase retrieval (default True). Set False for legacy mode.
    """
    payload: dict = {
        "query": query,
        "top_k": top_k,
        "smart": smart,
    }
    if session_id:
        payload["session_id"] = session_id
    elif not _bff_url:
        raise ValueError("session_id is required in direct validator mode; use --bff-url or pass session_id.")

    result = await _post("/v1/memory/query", payload)
    return json.dumps(result, indent=2)


@mcp.tool()
async def openmind_compact(session_id: str) -> str:
    """Trigger session anchor compaction for a session.

    Generates or updates a structured session summary (anchor) from
    all extracted facts. Anchors reduce token usage by replacing raw
    conversation history with a compact summary.

    Args:
        session_id: Session to compact.
    """
    result = await _post("/v1/memory/compact", {
        "session_id": session_id,
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def openmind_version(
    session_id: str,
    as_of_timestamp: Optional[str] = None,
    version_id: Optional[str] = None,
    diff_since: Optional[str] = None,
) -> str:
    """Time-travel or diff memory versions in OpenMind.

    Provide one of the three optional parameters to choose the mode:
    - as_of_timestamp: Reconstruct memory as it existed at this ISO-8601 time.
    - version_id: Jump directly to a specific version hash.
    - diff_since: Return only changes since this version or timestamp.

    Args:
        session_id: Session to query.
        as_of_timestamp: ISO 8601 timestamp for time-travel.
        version_id: Specific version hash.
        diff_since: Version or timestamp to diff from.
    """
    result = await _post("/v1/memory/version", {
        "session_id": session_id,
        "as_of_timestamp": as_of_timestamp,
        "version_id": version_id,
        "diff_since": diff_since,
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def openmind_checkpoint_save(
    workflow_id: str,
    step: int,
    state: Optional[str] = None,
) -> str:
    """Save an agent workflow checkpoint to OpenMind.

    Args:
        workflow_id: Unique workflow identifier.
        step: Current step number.
        state: JSON string of the workflow state (variables, decisions, etc.).
    """
    state_dict: Dict[str, Any] = {}
    if state:
        try:
            state_dict = json.loads(state)
        except json.JSONDecodeError:
            state_dict = {"raw": state}

    result = await _post("/v1/checkpoint/save", {
        "workflow_id": workflow_id,
        "step": step,
        "state": state_dict,
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def openmind_checkpoint_resume(workflow_id: str) -> str:
    """Resume from the latest checkpoint for a workflow.

    Args:
        workflow_id: Workflow to resume.
    """
    result = await _post("/v1/checkpoint/resume", {
        "workflow_id": workflow_id,
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def openmind_shared_query(
    session_id: str,
    shared_space_id: str,
    query: Optional[str] = None,
    top_k: int = 10,
    author: Optional[str] = None,
) -> str:
    """Query a shared memory space in OpenMind.

    Args:
        session_id: Session context.
        shared_space_id: ID of the shared memory space.
        query: Natural language search query.
        top_k: Maximum results.
        author: Wallet address or agent identifier for access control.
    """
    result = await _post("/v1/space/query", {
        "session_id": session_id,
        "shared_space_id": shared_space_id,
        "query": query,
        "top_k": top_k,
        "author": author,
    })
    return json.dumps(result, indent=2)


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------

@mcp.resource("openmind://health")
async def health_resource() -> str:
    """Current health status of the OpenMind validator gateway."""
    result = await _get("/v1/health")
    return json.dumps(result, indent=2)


@mcp.resource("openmind://context")
async def context_resource() -> str:
    """
    A pre-formatted context prompt for clients that support automatic prompt injection.

    Intended to behave like "always-on memory": the model should search for relevant
    memories before answering and should save important user/agent facts at the end.
    """
    return (
        "You have access to OpenMind memory via MCP tools.\n\n"
        "- Before answering, call `openmind_query` with the user's intent to retrieve relevant memories.\n"
        "- Use the retrieved memory results to ground your response.\n"
        "- After the user request is completed, call `openmind_store` to save any durable facts,\n"
        "  decisions, preferences, and new context revealed in this conversation.\n"
        "- If a `session_id` is not provided, rely on BFF mode (when available) to derive the session namespace.\n"
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main():
    global _api_url, _bff_url, _api_key
    parser = argparse.ArgumentParser(description="OpenMind MCP server")
    parser.add_argument(
        "--api-url",
        default="http://localhost:8090",
        help="Base URL of the validator REST gateway (direct mode; default when --bff-url is unset).",
    )
    parser.add_argument(
        "--bff-url",
        default="",
        help="Next.js origin (e.g. http://localhost:3000). Uses /api/gateway/* with Bearer auth. "
        "If omitted, OPENMIND_BFF_URL env is used.",
    )
    parser.add_argument(
        "--api-key",
        default="",
        help="om_live_… API key for BFF mode. Falls back to OPENMIND_API_KEY env var.",
    )
    args = parser.parse_args()
    _api_url = args.api_url.rstrip("/")
    bff = (args.bff_url or os.environ.get("OPENMIND_BFF_URL", "") or "").strip()
    if bff:
        _bff_url = bff.rstrip("/")
    key = (args.api_key or os.environ.get("OPENMIND_API_KEY", "")).strip()
    if bff and not key:
        parser.error(
            "BFF mode requires OPENMIND_API_KEY (or --api-key). "
            "Set BFF via --bff-url or OPENMIND_BFF_URL."
        )
    _api_key = key or None
    mcp.run()


if __name__ == "__main__":
    main()
