#!/usr/bin/env bash
set -euo pipefail

# End-to-end smoke test for deterministic shard + merged query behavior.
#
# What it does:
# 1) Stores a unique marker memory via BFF gateway
# 2) Queries that marker repeatedly
# 3) Fails if any query misses the marker
#
# Usage:
#   OPENMIND_API_KEY=om_live_xxx ./scripts/test-deterministic-shard-merge.sh
#
# Optional env:
#   OPENMIND_BFF_URL=http://localhost:3000
#   TEST_ROUNDS=8
#   TEST_TOP_K=18
#   TEST_SMART=true

OPENMIND_BFF_URL="${OPENMIND_BFF_URL:-http://localhost:3000}"
TEST_ROUNDS="${TEST_ROUNDS:-8}"
TEST_TOP_K="${TEST_TOP_K:-18}"
TEST_SMART="${TEST_SMART:-true}"

if [[ -z "${OPENMIND_API_KEY:-}" ]]; then
  echo "ERROR: OPENMIND_API_KEY is required."
  echo "Example: OPENMIND_API_KEY=om_live_xxx ./scripts/test-deterministic-shard-merge.sh"
  exit 1
fi

STORE_URL="${OPENMIND_BFF_URL%/}/api/gateway/memory/store"
QUERY_URL="${OPENMIND_BFF_URL%/}/api/gateway/memory/query"

STAMP="$(date +%s)"
MARKER="deterministic-shard-merge-marker-${STAMP}"
STORE_CONTENT="Test memory marker ${MARKER}. Topic: frictionless memory deterministic shard merge."

echo "== Deterministic Shard + Merge Smoke Test =="
echo "BFF URL: ${OPENMIND_BFF_URL}"
echo "Rounds: ${TEST_ROUNDS}"
echo "Smart mode: ${TEST_SMART}"
echo "Marker: ${MARKER}"
echo

echo "[1/2] Storing unique marker memory..."
STORE_RESP="$(curl -sS -X POST "${STORE_URL}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${OPENMIND_API_KEY}" \
  -d "$(python - "$STORE_CONTENT" <<'PY'
import json, sys
print(json.dumps({
  "content": sys.argv[1],
  "role": "user",
  "multimodal_type": "text"
}))
PY
)")"

echo "Store response (truncated):"
printf '%s' "$STORE_RESP" | python -c '
import json, sys
raw = sys.stdin.read()
try:
    obj = json.loads(raw)
    s = json.dumps(obj)[:400]
    print(s + ("..." if len(json.dumps(obj)) > 400 else ""))
except Exception:
    print(raw[:400] + ("..." if len(raw) > 400 else ""))
'
echo

echo "[2/2] Repeated query checks..."
PASS_COUNT=0

for ((i=1; i<=TEST_ROUNDS; i++)); do
  RESP="$(curl -sS -X POST "${QUERY_URL}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${OPENMIND_API_KEY}" \
    -d "$(python - "$MARKER" "$TEST_TOP_K" "$TEST_SMART" <<'PY'
import json, sys
print(json.dumps({
  "query": sys.argv[1],
  "top_k": int(sys.argv[2]),
  "smart": str(sys.argv[3]).lower() == "true"
}))
PY
)")"

  FOUND="$(printf '%s' "$RESP" | python -c '
import json, sys
marker = sys.argv[1]
raw = sys.stdin.read()
try:
    obj = json.loads(raw)
except Exception:
    print("0")
    raise SystemExit(0)
def has_marker(v):
    if isinstance(v, str): return marker in v
    if isinstance(v, dict): return any(has_marker(x) for x in v.values())
    if isinstance(v, list): return any(has_marker(x) for x in v)
    return False
print("1" if has_marker(obj) else "0")
' "$MARKER")"

  if [[ "${FOUND}" == "1" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "  Round ${i}/${TEST_ROUNDS}: PASS (marker found)"
  else
    echo "  Round ${i}/${TEST_ROUNDS}: FAIL (marker not found)"
    echo "  Response (truncated):"
    printf '%s' "$RESP" | python -c '
import sys
raw = sys.stdin.read()
print(raw[:600] + ("..." if len(raw) > 600 else ""))
'
    exit 2
  fi
done

echo
echo "All rounds passed: ${PASS_COUNT}/${TEST_ROUNDS}"
echo "Deterministic shard + merge behavior looks consistent for this marker."
