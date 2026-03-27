#!/usr/bin/env python3
"""
Direct ingestion of LongMemEval data — bypasses the Bittensor network.

Writes directly to the miner's on-disk storage using the ``openmind``
modules. After running this script, restart the miner so it loads the
new data into memory.

This is ~50x faster than API-based ingestion because it skips the
Bittensor Dendrite/Axon round-trip for each store call.
"""

import argparse
import datetime
import json
import os
import sys
import uuid
from pathlib import Path

# Add the openmind-subnet root to sys.path so we can import modules.
_SUBNET_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_SUBNET_ROOT))

os.environ.setdefault(
    "OPENMIND_STORAGE_DIR",
    str(_SUBNET_ROOT / ".openmind_storage"),
)

from openmind import storage, storage_v2, extraction, graph  # noqa: E402
from tqdm import tqdm  # noqa: E402


def _select_storage(backend: str):
    b = (backend or "legacy").lower()
    if b == "sqlite":
        return storage_v2
    return storage


def _format_session(turns: list) -> str:
    """Concatenate conversation turns with role markers."""
    parts = []
    for t in turns:
        role = t.get("role", "user")
        content = t.get("content", "")
        if content:
            parts.append(f"[{role}] {content}")
    return "\n\n".join(parts)


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


def direct_ingest(
    data_path: str,
    max_questions: int = 0,
    skip_extraction: bool = False,
    storage_backend: str = "legacy",
    dual_write: bool = False,
):
    primary_storage = _select_storage(storage_backend)
    secondary_storage = None
    if dual_write:
        secondary_storage = storage if primary_storage is storage_v2 else storage_v2

    data = json.loads(Path(data_path).read_text(encoding="utf-8"))
    if not isinstance(data, list):
        data = data.get("questions", data.get("data", [data]))

    if max_questions > 0:
        data = data[:max_questions]

    total_episodes = 0
    total_facts = 0

    for question in tqdm(data, desc="Direct ingesting"):
        qid = question.get("question_id") or question.get("id", "")
        haystack_sessions = question.get("haystack_sessions", [])
        haystack_ids = question.get("haystack_session_ids", [])

        if not haystack_sessions:
            continue

        session_facts = []

        for i, session_turns in enumerate(haystack_sessions):
            if not session_turns:
                continue

            text = _format_session(session_turns)
            if not text.strip():
                continue

            chunk_id = str(uuid.uuid4())
            ts = datetime.datetime.now(datetime.timezone.utc).isoformat()

            _store_chunk(
                session_id=qid,
                content=text,
                embedding=[],
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
                    _store_chunk(
                        session_id=qid,
                        content=fact["content"],
                        embedding=[],
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
                    _store_chunk(
                        session_id=qid,
                        content=anchor["content"],
                        embedding=[],
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
    args = parser.parse_args()
    direct_ingest(
        args.data,
        args.max_questions,
        args.skip_extraction,
        args.storage_backend,
        args.dual_write,
    )


if __name__ == "__main__":
    main()
