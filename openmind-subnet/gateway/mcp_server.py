"""
MCP (Model Context Protocol) server for the OpenMind subnet.

This wraps the REST gateway so any MCP-compatible AI agent (Claude Desktop,
Cursor, LangGraph, etc.) can connect with a single endpoint and gain access
to OpenMind's decentralised memory layer.

Usage (stdio transport — default for Claude Desktop / Cursor):

    python -m gateway.mcp_server --api-url http://localhost:8090

Add to your MCP client config (e.g. Claude Desktop):

    {
      "mcpServers": {
        "openmind": {
          "command": "python",
          "args": ["-m", "gateway.mcp_server", "--api-url", "http://localhost:8090"]
        }
      }
    }
"""

import argparse
import json
from typing import Any, Dict, List, Optional

import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("OpenMind")

_api_url: str = "http://localhost:8090"


def _url(path: str) -> str:
    return f"{_api_url}{path}"


async def _post(path: str, payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(_url(path), json=payload)
        resp.raise_for_status()
        return resp.json()


async def _get(path: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_url(path))
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def openmind_store(
    session_id: str,
    content: str,
    tier: str = "basic",
    multimodal_type: Optional[str] = None,
) -> str:
    """Store a memory chunk in the OpenMind decentralised memory layer.

    Args:
        session_id: Unique session identifier (scopes the memory).
        content: The text content to store.
        tier: Durability tier — "basic" (replicated) or "premium" (Reed-Solomon).
        multimodal_type: Optional — "text", "image", or "pdf".
    """
    result = await _post("/v1/memory/store", {
        "session_id": session_id,
        "content": content,
        "tier": tier,
        "multimodal_type": multimodal_type,
    })
    return json.dumps(result, indent=2)


@mcp.tool()
async def openmind_query(
    session_id: str,
    query: str,
    top_k: int = 10,
    tier: str = "basic",
) -> str:
    """Search and retrieve memories from the OpenMind memory layer.

    Args:
        session_id: Session to search within.
        query: Natural language search query.
        top_k: Maximum number of results to return.
        tier: Durability tier — "basic" or "premium".
    """
    result = await _post("/v1/memory/query", {
        "session_id": session_id,
        "query": query,
        "top_k": top_k,
        "tier": tier,
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


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main():
    global _api_url
    parser = argparse.ArgumentParser(description="OpenMind MCP server")
    parser.add_argument(
        "--api-url",
        default="http://localhost:8090",
        help="Base URL of the OpenMind REST gateway.",
    )
    args = parser.parse_args()
    _api_url = args.api_url.rstrip("/")
    mcp.run()


if __name__ == "__main__":
    main()
