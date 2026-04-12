#!/usr/bin/env python3
"""
Retrieve answers for LongMemEval questions via the OpenMind gateway.

For each question, sends a query via POST /v1/memory/query using
``session_id = question_id`` (matching what ``direct_ingest.py`` stored)
and logs retrieval results plus token counts.

Key improvements:
- Generates query embeddings via local Ollama (nomic-embed-text) so the
  miner can perform cosine similarity search instead of keyword-only.
- Deduplicates retrieved items before assembling context.
- Higher default ``max_item_chars`` since ingestion now produces small chunks.

Outputs a JSONL file with: question_id, question, session_id,
category, retrieval_results, context_text, token_count.
"""

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import URLError
from urllib.request import Request, urlopen

import httpx
import tiktoken
from tqdm import tqdm

_OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
_EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text")


def _embed_query(text: str) -> List[float]:
    """Get query embedding from local Ollama instance."""
    payload = json.dumps({"model": _EMBED_MODEL, "prompt": text[:8000]}).encode()
    req = Request(
        f"{_OLLAMA_URL}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    for attempt in range(3):
        try:
            with urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
            return data["embedding"]
        except (URLError, KeyError, OSError):
            if attempt == 2:
                return []
            time.sleep(1.0 * (attempt + 1))
    return []


def count_tokens(text: str) -> int:
    try:
        enc = tiktoken.get_encoding("cl100k_base")
        return len(enc.encode(text))
    except Exception:
        return max(1, len(text) // 4)


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _unwrap_smart_payload(resp_data: Dict[str, Any]) -> Tuple[
    Optional[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]
]:
    """
    Gateway returns anchor / facts / sources at the top level.
    ``facts`` may be [] (e.g. SKIP_EXTRACTION) — still a smart response.
    Sometimes the same structure is nested under ``results[0]``.
    """
    anchor = resp_data.get("anchor")
    facts = resp_data.get("facts")
    sources = resp_data.get("sources")
    if facts is None:
        facts = []
    if sources is None:
        sources = []

    has_top = anchor is not None or len(facts) > 0 or len(sources) > 0
    if not has_top:
        for block in resp_data.get("results") or []:
            if not isinstance(block, dict):
                continue
            if block.get("content"):
                continue
            if any(k in block for k in ("anchor", "facts", "sources", "fact_count")):
                anchor = block.get("anchor")
                facts = block.get("facts") or []
                sources = block.get("sources") or []
                break

    return anchor, facts, sources


def retrieve(
    questions_path: str,
    output_path: str,
    api_url: str,
    smart: bool = True,
    top_k: int = 20,
    max_questions: int = 0,
    delay: float = 0.05,
    max_context_tokens: int = 8000,
    max_item_chars: int = 0,
    skip_embeddings: bool = False,
):
    data = json.loads(Path(questions_path).read_text(encoding="utf-8"))
    if not isinstance(data, list):
        data = data.get("questions", data.get("data", []))

    if max_questions > 0:
        data = data[:max_questions]

    if not skip_embeddings:
        test_emb = _embed_query("test")
        if not test_emb:
            print(
                "WARNING: Ollama not reachable. Falling back to keyword-only retrieval.\n"
                "         Set OLLAMA_URL or use --skip-embeddings to silence this.",
                file=sys.stderr,
            )
            skip_embeddings = True
        else:
            print(f"Query embeddings: {_EMBED_MODEL} (dim={len(test_emb)}) via {_OLLAMA_URL}")

    client = httpx.Client(base_url=api_url, timeout=30.0)
    results = []
    total_tokens = 0

    for q in tqdm(data, desc="Retrieving"):
        qid = q.get("question_id") or q.get("id", "")
        question = q.get("question") or q.get("query", "")
        category = q.get("question_type") or q.get("category", "unknown")

        embedding = None if skip_embeddings else _embed_query(question)

        payload = {
            "session_id": str(qid),
            "query": question,
            "top_k": top_k,
            "smart": smart,
        }
        if embedding:
            payload["embedding"] = embedding

        try:
            resp = client.post("/v1/memory/query", json=payload)
            resp.raise_for_status()
            resp_data = resp.json()
        except Exception as e:
            print(f"  Error querying {qid}: {e}", file=sys.stderr)
            resp_data = {"results": []}

        context_text = ""
        ranked_items = []
        context_tokens = 0
        seen_hashes: set = set()

        def _add_to_context(text: str) -> bool:
            """Append to context until token budget is exhausted, skipping duplicates."""
            nonlocal context_text, context_tokens
            if not text:
                return True
            h = _content_hash(text)
            if h in seen_hashes:
                return True
            seen_hashes.add(h)
            if max_item_chars and len(text) > max_item_chars:
                text = text[:max_item_chars] + "…"
            t = count_tokens(text)
            if max_context_tokens and (context_tokens + t) > max_context_tokens:
                return False
            context_text += text + "\n"
            context_tokens += t
            return True

        if smart:
            anchor, facts, sources = _unwrap_smart_payload(resp_data)

            if anchor and isinstance(anchor, dict):
                anchor_content = anchor.get("content", "")
                _add_to_context(anchor_content)
                ranked_items.append({
                    "type": "anchor",
                    "content": anchor_content,
                })

            for f in facts:
                if not isinstance(f, dict):
                    continue
                content = f.get("content", "")
                if not _add_to_context(content):
                    break
                ranked_items.append({
                    "type": f.get("type", "fact"),
                    "id": f.get("id"),
                    "content": content,
                    "score": f.get("score", 0),
                })

            for s in sources:
                if not isinstance(s, dict):
                    continue
                content = s.get("content", "")
                if not _add_to_context(content):
                    break
                ranked_items.append({
                    "type": s.get("type", "source"),
                    "id": s.get("id"),
                    "content": content,
                })

            # Smart response with empty facts/sources still uses "facts" for episode
            # hits from retrieve_smart — if nothing was added, fall back to flat results.
            if not ranked_items:
                for r in resp_data.get("results", []):
                    if not isinstance(r, dict):
                        continue
                    content = r.get("content", "")
                    if not content:
                        continue
                    if not _add_to_context(content):
                        break
                    ranked_items.append({
                        "type": r.get("type", "episode"),
                        "id": r.get("id"),
                        "content": content,
                        "score": r.get("score", 0),
                    })
        else:
            for r in resp_data.get("results", []):
                if not isinstance(r, dict):
                    continue
                content = r.get("content", "")
                if not _add_to_context(content):
                    break
                ranked_items.append({
                    "type": r.get("type", "episode"),
                    "id": r.get("id"),
                    "content": content,
                    "score": r.get("score", 0),
                })

        tokens = resp_data.get("token_estimate") or context_tokens or count_tokens(context_text)
        total_tokens += tokens

        results.append({
            "question_id": qid,
            "question": question,
            "session_id": str(qid),
            "category": category,
            "retrieval_results": {"ranked_items": ranked_items},
            "context_text": context_text.strip(),
            "token_count": tokens,
        })

        if delay > 0:
            time.sleep(delay)

    client.close()

    with open(output_path, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    avg_tokens = total_tokens / len(results) if results else 0
    non_empty = sum(1 for r in results if r["context_text"].strip())
    print(
        f"\nRetrieval complete: {len(results)} questions, "
        f"{non_empty} with context, "
        f"avg {avg_tokens:.0f} tokens/query, total {total_tokens} tokens."
    )
    print(f"Output: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Retrieve LongMemEval answers from OpenMind"
    )
    parser.add_argument(
        "--questions",
        default="longmemeval_s_cleaned.json",
        help="Questions JSON file",
    )
    parser.add_argument(
        "--output",
        default="retrieval_results.jsonl",
        help="Output JSONL path",
    )
    parser.add_argument(
        "--api-url",
        default="http://localhost:8090",
        help="OpenMind gateway URL",
    )
    parser.add_argument(
        "--smart",
        action="store_true",
        default=True,
        help="Use smart retrieval",
    )
    parser.add_argument(
        "--no-smart",
        dest="smart",
        action="store_false",
        help="Use legacy retrieval",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=20,
        help="Top K results",
    )
    parser.add_argument(
        "--max-questions",
        type=int,
        default=0,
        help="Limit number of questions (0 = all)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.05,
        help="Delay between queries (seconds)",
    )
    parser.add_argument(
        "--max-context-tokens",
        type=int,
        default=8000,
        help="Hard cap for context tokens written per question (0 = unlimited)",
    )
    parser.add_argument(
        "--max-item-chars",
        type=int,
        default=0,
        help="Truncate each retrieved item content to this many chars (0 = unlimited)",
    )
    parser.add_argument(
        "--skip-embeddings",
        action="store_true",
        help="Skip query embedding generation (keyword-only retrieval)",
    )
    args = parser.parse_args()
    retrieve(
        args.questions,
        args.output,
        args.api_url,
        args.smart,
        args.top_k,
        args.max_questions,
        args.delay,
        args.max_context_tokens,
        args.max_item_chars,
        args.skip_embeddings,
    )


if __name__ == "__main__":
    main()
