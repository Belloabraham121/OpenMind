#!/usr/bin/env python3
"""
Ingest LongMemEval sessions into the OpenMind gateway.

Each question in the dataset has its own haystack of ~50 sessions. We store
all turns for a question under ``session_id = question_id`` so that retrieval
can search the correct haystack.

To keep the number of API calls manageable, turns within each haystack session
are concatenated into a single store call with role markers.
"""

import argparse
import json
import sys
import time
from pathlib import Path

import httpx
from tqdm import tqdm


def _format_session(turns: list) -> str:
    """Concatenate conversation turns with role markers."""
    parts = []
    for t in turns:
        role = t.get("role", "user")
        content = t.get("content", "")
        if content:
            parts.append(f"[{role}] {content}")
    return "\n\n".join(parts)


def ingest(
    data_path: str,
    api_url: str,
    delay: float = 0.02,
    max_questions: int = 0,
):
    data = json.loads(Path(data_path).read_text(encoding="utf-8"))

    if not isinstance(data, list):
        data = data.get("questions", data.get("data", [data]))

    if max_questions > 0:
        data = data[:max_questions]

    client = httpx.Client(base_url=api_url, timeout=60.0)
    total_sessions_stored = 0
    total_facts = 0
    errors = 0

    for question in tqdm(data, desc="Ingesting questions"):
        qid = question.get("question_id") or question.get("id", "")
        haystack_sessions = question.get("haystack_sessions", [])
        haystack_ids = question.get("haystack_session_ids", [])

        if not haystack_sessions:
            continue

        for i, session_turns in enumerate(haystack_sessions):
            if not session_turns:
                continue

            text = _format_session(session_turns)
            if not text.strip():
                continue

            hay_sid = haystack_ids[i] if i < len(haystack_ids) else f"hay-{i}"

            payload = {
                "session_id": str(qid),
                "content": text,
                "role": "user",
            }

            try:
                resp = client.post("/v1/memory/store", json=payload)
                resp.raise_for_status()
                result = resp.json()
                stored = (result.get("results") or [{}])[0]
                fc = stored.get("fact_count", 0)
                total_facts += fc
                total_sessions_stored += 1
            except Exception as e:
                errors += 1
                if errors <= 5:
                    print(
                        f"  Error storing session {hay_sid} for Q {qid}: {e}",
                        file=sys.stderr,
                    )
                elif errors == 6:
                    print("  (suppressing further error messages)", file=sys.stderr)

            if delay > 0:
                time.sleep(delay)

    client.close()
    print(
        f"\nIngestion complete: {total_sessions_stored} sessions stored, "
        f"{total_facts} facts extracted across {len(data)} questions. "
        f"Errors: {errors}"
    )


def main():
    parser = argparse.ArgumentParser(
        description="Ingest LongMemEval data into OpenMind"
    )
    parser.add_argument(
        "--data",
        default="longmemeval_s_cleaned.json",
        help="Path to LongMemEval JSON file",
    )
    parser.add_argument(
        "--api-url",
        default="http://localhost:8090",
        help="OpenMind gateway URL",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.02,
        help="Delay between requests (seconds)",
    )
    parser.add_argument(
        "--max-questions",
        type=int,
        default=0,
        help="Limit number of questions to ingest (0 = all)",
    )
    args = parser.parse_args()
    ingest(args.data, args.api_url, args.delay, args.max_questions)


if __name__ == "__main__":
    main()
