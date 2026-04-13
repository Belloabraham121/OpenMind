#!/usr/bin/env python3
"""
Direct ingestion of LongMemEval data — bypasses the Bittensor network.

Writes directly to the miner's on-disk storage using the ``openmind``
modules. After running this script, restart the miner so it loads the
new data into memory.

Key improvements over the naive approach:
- Chunks conversations per-turn-pair instead of per-session, so each
  chunk is small enough for retrieval truncation to preserve the answer.
- Generates real embeddings via a local Ollama model (nomic-embed-text)
  so cosine similarity search actually works.
"""

import argparse
import datetime
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import List, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

_SUBNET_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_SUBNET_ROOT))

os.environ.setdefault(
    "OPENMIND_STORAGE_DIR",
    str(_SUBNET_ROOT / ".openmind_storage"),
)

from openmind import storage, storage_v2, extraction, graph  # noqa: E402
from tqdm import tqdm  # noqa: E402

_OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
_EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text")
_EMBED_RETRY = 5
# Pause after each successful embed so Ollama is not flooded (reduces HTTP 500 under load).
_EMBED_DELAY_SEC = float(os.environ.get("OLLAMA_EMBED_DELAY_SEC", "0.25"))


def _embed_text(text: str, delay_sec: Optional[float] = None) -> List[float]:
    """Get embedding from local Ollama instance (fresh POST each retry)."""
    if delay_sec is None:
        delay_sec = _EMBED_DELAY_SEC
    payload = json.dumps({"model": _EMBED_MODEL, "prompt": text[:8000]}).encode()
    url = f"{_OLLAMA_URL}/api/embeddings"
    from urllib.error import HTTPError

    last_err: Optional[BaseException] = None
    for attempt in range(_EMBED_RETRY):
        req = Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())
            emb = data.get("embedding") or []
            if emb:
                if delay_sec > 0:
                    time.sleep(delay_sec)
                return emb
        except HTTPError as exc:
            last_err = exc
            code = getattr(exc, "code", None)
            # Server overload / model busy — back off longer than generic errors
            if code in (429, 500, 502, 503):
                wait = min(30.0, 2.0 * (2 ** attempt))
            else:
                wait = 1.0 * (attempt + 1)
            if attempt < _EMBED_RETRY - 1:
                time.sleep(wait)
        except (URLError, KeyError, OSError, json.JSONDecodeError) as exc:
            last_err = exc
            if attempt < _EMBED_RETRY - 1:
                time.sleep(1.0 * (attempt + 1))

    print(f"  WARNING: embedding failed after {_EMBED_RETRY} retries: {last_err}", file=sys.stderr)
    return []


def _select_storage(backend: str):
    b = (backend or "legacy").lower()
    if b == "sqlite":
        return storage_v2
    return storage


def _chunk_session_turns(turns: list, max_turns_per_chunk: int = 4) -> List[str]:
    """Split a multi-turn session into small chunks of turn-pairs.

    Each chunk contains up to ``max_turns_per_chunk`` turns (2 turn-pairs)
    so that each chunk is short enough that answers survive the retrieval
    truncation limit (4000 chars).
    """
    chunks = []
    buffer = []
    for t in turns:
        role = t.get("role", "user")
        content = t.get("content", "")
        if not content:
            continue
        buffer.append(f"[{role}] {content}")
        if len(buffer) >= max_turns_per_chunk:
            chunks.append("\n\n".join(buffer))
            buffer = []
    if buffer:
        chunks.append("\n\n".join(buffer))
    return chunks


def _store_chunk(session_id, content, embedding, metadata, primary_storage, secondary_storage=None):
    """Write a chunk directly to disk."""
    chunk_id = metadata.get("id", "")
    if chunk_id:
        primary_storage.store_chunk(
            session_id=session_id,
            chunk_id=chunk_id,
            content=content,
            embedding=embedding,
            metadata=metadata,
        )
        if secondary_storage is not None:
            secondary_storage.store_chunk(
                session_id=session_id,
                chunk_id=chunk_id,
                content=content,
                embedding=embedding,
                metadata=metadata,
            )


def _clean_storage(storage_dir: Path, question_ids: list):
    """Remove previously ingested data for the given question IDs."""
    import shutil
    removed = 0
    for qid in question_ids:
        qid_dir = storage_dir / qid
        if qid_dir.is_dir():
            shutil.rmtree(qid_dir, ignore_errors=True)
            removed += 1
    # Also remove any sqlite db so we don't mix old + new data
    for db in storage_dir.glob("*.db"):
        db.unlink(missing_ok=True)
    if removed:
        print(f"Cleaned {removed} old session directories from {storage_dir}")


def direct_ingest(
    data_path: str,
    max_questions: int = 0,
    skip_extraction: bool = False,
    storage_backend: str = "legacy",
    dual_write: bool = False,
    skip_embeddings: bool = False,
    turns_per_chunk: int = 4,
    clean: bool = False,
    embed_delay_sec: Optional[float] = None,
):
    global _EMBED_DELAY_SEC
    if embed_delay_sec is not None:
        _EMBED_DELAY_SEC = float(embed_delay_sec)

    primary_storage = _select_storage(storage_backend)
    secondary_storage = None
    if dual_write:
        secondary_storage = storage if primary_storage is storage_v2 else storage_v2

    data = json.loads(Path(data_path).read_text(encoding="utf-8"))
    if not isinstance(data, list):
        data = data.get("questions", data.get("data", [data]))

    if max_questions > 0:
        data = data[:max_questions]

    if clean:
        all_qids = [q.get("question_id") or q.get("id", "") for q in data]
        _clean_storage(Path(primary_storage.BASE_DIR), all_qids)

    if not skip_embeddings:
        test_emb = _embed_text("test")
        if not test_emb:
            print("ERROR: Could not connect to Ollama. Set OLLAMA_URL or use --skip-embeddings.", file=sys.stderr)
            sys.exit(1)
        print(
            f"Embedding model: {_EMBED_MODEL} (dim={len(test_emb)}) via {_OLLAMA_URL} "
            f"(delay={_EMBED_DELAY_SEC}s between calls)"
        )

    total_episodes = 0
    total_facts = 0

    for question in tqdm(data, desc="Direct ingesting"):
        qid = question.get("question_id") or question.get("id", "")
        haystack_sessions = question.get("haystack_sessions", [])

        if not haystack_sessions:
            continue

        session_facts = []

        for i, session_turns in enumerate(haystack_sessions):
            if not session_turns:
                continue

            chunks = _chunk_session_turns(session_turns, max_turns_per_chunk=turns_per_chunk)

            for chunk_idx, text in enumerate(chunks):
                if not text.strip():
                    continue

                chunk_id = str(uuid.uuid4())
                ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
                embedding = _embed_text(text) if not skip_embeddings else []

                _store_chunk(
                    session_id=qid,
                    content=text,
                    embedding=embedding,
                    primary_storage=primary_storage,
                    secondary_storage=secondary_storage,
                    metadata={
                        "id": chunk_id,
                        "type": "episode",
                        "role": "user",
                        "timestamp": ts,
                        "recorded_at": ts,
                        "event_at": None,
                        "multimodal_type": None,
                    },
                )
                total_episodes += 1

                if not skip_extraction:
                    try:
                        facts = extraction.extract_facts(
                            content=text,
                            episode_id=chunk_id,
                            session_id=qid,
                            role="user",
                            recorded_at=ts,
                        )
                    except Exception:
                        facts = []

                    for fact in facts:
                        fact_emb = _embed_text(fact["content"]) if not skip_embeddings else []
                        _store_chunk(
                            session_id=qid,
                            content=fact["content"],
                            embedding=fact_emb,
                            primary_storage=primary_storage,
                            secondary_storage=secondary_storage,
                            metadata={
                                "id": fact["id"],
                                "type": "fact",
                                "source_episode_id": fact["source_episode_id"],
                                "subject": fact["subject"],
                                "predicate": fact["predicate"],
                                "object": fact["object"],
                                "confidence": fact["confidence"],
                                "recorded_at": fact["recorded_at"],
                                "event_at": fact["event_at"],
                                "valid_from": fact["valid_from"],
                                "valid_until": fact["valid_until"],
                                "is_latest": True,
                                "role": fact["role"],
                                "fact_keys": fact["fact_keys"],
                                "timestamp": ts,
                            },
                        )
                        total_facts += 1

                        edges = graph.detect_relationships(fact, session_facts)
                        for edge in edges:
                            if edge["relation"] == "supersedes":
                                old_id = edge["target_id"]
                                primary_storage.update_chunk_metadata(
                                    qid, old_id,
                                    {"is_latest": False, "valid_until": ts},
                                )
                                if secondary_storage is not None:
                                    secondary_storage.update_chunk_metadata(
                                        qid, old_id,
                                        {"is_latest": False, "valid_until": ts},
                                    )

                        session_facts.append(fact)

        if not skip_extraction and session_facts:
            try:
                anchor = extraction.generate_anchor(qid, session_facts, None)
                if anchor:
                    anchor_emb = _embed_text(anchor["content"]) if not skip_embeddings else []
                    _store_chunk(
                        session_id=qid,
                        content=anchor["content"],
                        embedding=anchor_emb,
                        primary_storage=primary_storage,
                        secondary_storage=secondary_storage,
                        metadata=anchor,
                    )
            except Exception:
                pass

    print(
        f"\nDirect ingestion complete: "
        f"{total_episodes} episodes + {total_facts} facts "
        f"across {len(data)} questions."
    )
    print(
        f"Storage backend: {'sqlite' if primary_storage is storage_v2 else 'legacy'}"
    )
    print(
        f"Storage dir: {primary_storage.BASE_DIR}"
    )
    print(
        f"Embeddings: {'skipped' if skip_embeddings else f'{_EMBED_MODEL} via {_OLLAMA_URL}'}"
    )
    print(
        "\n*** IMPORTANT: Restart the miner so it loads the new data! ***"
    )


def main():
    parser = argparse.ArgumentParser(
        description="Direct-ingest LongMemEval into miner storage (no network)"
    )
    parser.add_argument(
        "--data",
        default="longmemeval_s_cleaned.json",
        help="Path to LongMemEval JSON file",
    )
    parser.add_argument(
        "--max-questions",
        type=int,
        default=0,
        help="Limit number of questions (0 = all)",
    )
    parser.add_argument(
        "--skip-extraction",
        action="store_true",
        help="Skip fact extraction (store raw episodes only — faster but no smart retrieval)",
    )
    parser.add_argument(
        "--skip-embeddings",
        action="store_true",
        help="Skip embedding generation (fall back to BM25 keyword search only)",
    )
    parser.add_argument(
        "--turns-per-chunk",
        type=int,
        default=4,
        help="Max conversation turns per chunk (lower = more precise retrieval, more chunks)",
    )
    parser.add_argument(
        "--storage-backend",
        default=os.environ.get("OPENMIND_STORAGE_BACKEND", "legacy"),
        choices=["legacy", "sqlite"],
        help="Storage backend for ingest writes",
    )
    parser.add_argument(
        "--dual-write",
        action="store_true",
        default=os.environ.get("OPENMIND_STORAGE_DUAL_WRITE", "false").lower() == "true",
        help="Write to both legacy and sqlite backends",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove old ingested data for the same question IDs before ingesting",
    )
    parser.add_argument(
        "--embed-delay",
        type=float,
        default=None,
        help="Seconds to sleep after each successful Ollama embed (default: OLLAMA_EMBED_DELAY_SEC or 0.25)",
    )
    args = parser.parse_args()
    direct_ingest(
        args.data,
        args.max_questions,
        args.skip_extraction,
        args.storage_backend,
        args.dual_write,
        args.skip_embeddings,
        args.turns_per_chunk,
        args.clean,
        args.embed_delay,
    )


if __name__ == "__main__":
    main()
