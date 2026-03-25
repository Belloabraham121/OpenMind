#!/usr/bin/env python3
"""
Migrate legacy JSON chunk storage to per-session SQLite storage.

Usage:
  python scripts/migrate_storage_to_sqlite.py
  python scripts/migrate_storage_to_sqlite.py --session-id e47becba
  python scripts/migrate_storage_to_sqlite.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, Any

# Ensure repo root is on sys.path when run as a script.
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from openmind import storage, storage_v2


def migrate_session(session_id: str, dry_run: bool = False) -> Dict[str, int]:
    rows = storage.load_session_chunks(session_id)
    inserted = 0
    skipped = 0

    for row in rows:
        metadata = row.get("metadata") or {}
        chunk_id = metadata.get("id")
        if not chunk_id:
            skipped += 1
            continue
        if not dry_run:
            storage_v2.store_chunk(
                session_id=session_id,
                chunk_id=chunk_id,
                content=row.get("content", ""),
                embedding=row.get("embedding") or [],
                metadata=metadata,
            )
        inserted += 1

    return {"session_id": session_id, "inserted": inserted, "skipped": skipped}


def main():
    parser = argparse.ArgumentParser(description="Migrate legacy storage to sqlite")
    parser.add_argument("--session-id", default="", help="Only migrate one session")
    parser.add_argument("--dry-run", action="store_true", help="Do not write data")
    args = parser.parse_args()

    sessions = [args.session_id] if args.session_id else storage.session_ids()
    total_inserted = 0
    total_skipped = 0

    for sid in sessions:
        result = migrate_session(sid, dry_run=args.dry_run)
        total_inserted += result["inserted"]
        total_skipped += result["skipped"]
        print(
            f"{sid}: inserted={result['inserted']} skipped={result['skipped']}"
        )

    print(
        f"\nDone. sessions={len(sessions)} inserted={total_inserted} skipped={total_skipped}"
    )
    if args.dry_run:
        print("Dry-run mode: no writes performed.")


if __name__ == "__main__":
    main()
