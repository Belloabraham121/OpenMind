# OpenMind Storage V2 Execution Plan

## Goal

Replace file-per-chunk persistence with per-session SQLite storage while preserving PRD-aligned capabilities:

- lossless memory persistence
- time-travel/version metadata
- provenance/graph support
- smart retrieval (facts + anchors + sources)
- benchmark repeatability without re-ingestion

---

## Phase 1 - Storage V2 Foundation

### 1.1 Create `storage_v2` module

Add `openmind/storage_v2.py` (keep current `openmind/storage.py` untouched initially).

### 1.2 One SQLite file per session

Path layout:

- `OPENMIND_STORAGE_DIR/<session_id>/store.sqlite`

Schema (initial):

- `episodes`
- `facts`
- `anchors`
- `edges`
- `versions`

Suggested key columns:

- IDs (`id`, `source_episode_id`, `version_id`, `parent_version_id`)
- content fields (`content`, `fact_keys`, `metadata_json`)
- temporal fields (`timestamp`, `recorded_at`, `event_at`, `valid_from`, `valid_until`)
- retrieval fields (`is_latest`, `confidence`, `relation`)
- optional `embedding_json` if needed for backward compatibility

### 1.3 Indexing

Add indexes for fast query paths:

- `facts(is_latest, valid_from, valid_until)`
- `facts(source_episode_id)`
- `episodes(timestamp)`
- `edges(source_id)`, `edges(target_id)`
- optional full-text index for keyword retrieval

### 1.4 API parity layer

Implement drop-in equivalents used by existing code:

- `store_chunk`
- `load_chunk`
- `load_session_chunks`
- `load_all_chunks` (temporary compatibility)
- `update_chunk_metadata`
- `session_ids`

---

## Phase 2 - Safe Cutover via Dual-Write

### 2.1 Dual-write in miner

In `neurons/miner.py`, write to both backends:

- legacy JSON chunk storage
- new SQLite session store

Add env flag:

- `OPENMIND_STORAGE_DUAL_WRITE=true|false`

### 2.2 Read backend toggle

In `openmind/retrieval.py`, introduce:

- `OPENMIND_STORAGE_BACKEND=legacy|sqlite`

Keep both loaders during transition.

### 2.3 Parity validation

Create a small validation utility to compare, per session:

- episode counts
- fact counts
- anchor presence
- edge counts
- sampled content/hash parity

---

## Phase 3 - Migration Tooling

### 3.1 Migration script

Create `scripts/migrate_storage_to_sqlite.py`:

- iterate legacy session directories
- read chunk JSON files
- route by `metadata.type` into proper SQLite tables
- migrate graph edges into SQLite-backed edge storage
- idempotent inserts (`INSERT OR IGNORE`)

### 3.2 Migration modes

Support:

- `--dry-run`
- `--session-id <id>`
- `--limit <N>`

### 3.3 Version backfill

Backfill minimal `versions` rows where necessary so time-travel/provenance paths can evolve without blocking migration.

---

## Phase 4 - Retrieval and Graph Optimization

### 4.1 Session-local loading

In `openmind/retrieval.py`, stop loading all sessions by default.

Load only the requested session rows:

- facts
- anchors
- relevant episodes

Optional: add small LRU session cache.

### 4.2 Smart retrieval consistency

Ensure benchmark and gateway consume the same smart response shape:

- `anchor`
- `facts`
- `sources`

Avoid shape mismatch between `results` payload and top-level fields.

### 4.3 Graph compaction

Replace unbounded global edge growth with session-local storage + cleanup rules:

- drop or mark stale edges when superseded facts become non-latest
- periodic compaction job

---

## Phase 5 - Benchmark Pipeline Hardening

### 5.1 Repeatable runs without storage growth

Run pattern:

1. one-time ingest (`SKIP_INGEST=false`)
2. repeated benchmark runs (`SKIP_INGEST=true`)

### 5.2 Resilience

Keep/expand protections:

- skip malformed JSONL lines in generation
- cap retrieval context size (`max_context_tokens`, `max_item_chars`)
- keep model/rate-limit controls stable

### 5.3 Category coverage

Add stratified sampling option for small runs so reports include all LongMemEval categories (avoid N/A-heavy reports).

---

## Phase 6 - Operational Guardrails

### 6.1 Disk safeguards

Before heavy ingest:

- check free disk threshold
- warn/abort if below minimum

### 6.2 Service health checks

Before benchmark retrieval:

- ensure gateway up
- ensure miner reachable
- ensure validator routing works

### 6.3 Backup points

Create backup/snapshot before migration and before final backend switch.

---

## Phase 7 - Final Cutover

### 7.1 Switch default

Set:

- `OPENMIND_STORAGE_BACKEND=sqlite`

Keep legacy fallback toggle for one stabilization cycle.

### 7.2 Disable dual-write

After parity confidence:

- set `OPENMIND_STORAGE_DUAL_WRITE=false`

### 7.3 Legacy retirement

Archive old JSON chunk format and remove legacy path after soak period.

---

## Test Plan

### Unit tests

- insert/read/update for episodes/facts/anchors/edges
- temporal filters (`valid_from`, `valid_until`)
- migration idempotency

### Integration tests

- store -> query_smart -> compact
- legacy vs sqlite parity for sampled sessions
- benchmark smoke test (`MAX_QUESTIONS=20`) in both smart and baseline modes

### Performance tests

- ingest throughput (rows/sec)
- retrieval latency p95
- disk growth per session
- file-count reduction vs legacy storage

---

## Milestones

- **M1:** `storage_v2.py` + schema + dual-write
- **M2:** migration script validated on sample sessions
- **M3:** retrieval reads from sqlite behind flag
- **M4:** benchmark stable with `SKIP_INGEST=true` repeat runs
- **M5:** sqlite default, legacy storage retired

---

## Immediate Next Step

Implement Phase 1 (`openmind/storage_v2.py`) and wire dual-write in `neurons/miner.py` behind `OPENMIND_STORAGE_DUAL_WRITE=true`.
