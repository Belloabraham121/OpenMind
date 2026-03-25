#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load local environment variables (e.g. OPENAI_API_KEY) if present.
if [ -f ".env" ]; then
    # shellcheck disable=SC1091
    source ".env"
fi

API_URL="${API_URL:-http://localhost:8090}"
DATA_FILE="${DATA_FILE:-longmemeval_s_cleaned.json}"
MODEL="${MODEL:-gpt-4o-mini}"
JUDGE_MODEL="${JUDGE_MODEL:-gpt-4o-mini}"
LABEL="${LABEL:-$(date +%Y%m%d-%H%M%S)}"
SMART="${SMART:-true}"
TOP_K="${TOP_K:-20}"
CALL_DELAY="${CALL_DELAY:-0.5}"
MAX_QUESTIONS="${MAX_QUESTIONS:-0}"
SKIP_INGEST="${SKIP_INGEST:-false}"
SKIP_EXTRACTION="${SKIP_EXTRACTION:-false}"
OPENMIND_STORAGE_BACKEND="${OPENMIND_STORAGE_BACKEND:-legacy}"
OPENMIND_STORAGE_DUAL_WRITE="${OPENMIND_STORAGE_DUAL_WRITE:-false}"

BASE_URL_FLAG=""
if [ -n "${OPENAI_BASE_URL:-}" ]; then
    BASE_URL_FLAG="--base-url $OPENAI_BASE_URL"
fi

API_KEY_FLAG=""
if [ -n "${OPENAI_API_KEY:-}" ]; then
    API_KEY_FLAG="--api-key $OPENAI_API_KEY"
fi

MAX_Q_FLAG=""
if [ "$MAX_QUESTIONS" != "0" ]; then
    MAX_Q_FLAG="--max-questions $MAX_QUESTIONS"
fi

SKIP_EXTRACT_FLAG=""
if [ "$SKIP_EXTRACTION" = "true" ]; then
    SKIP_EXTRACT_FLAG="--skip-extraction"
fi

DUAL_WRITE_FLAG=""
if [ "$OPENMIND_STORAGE_DUAL_WRITE" = "true" ]; then
    DUAL_WRITE_FLAG="--dual-write"
fi

echo "============================================"
echo "  OpenMind LongMemEval Benchmark"
echo "  Label:       $LABEL"
echo "  API:         $API_URL"
echo "  Model:       $MODEL"
echo "  Judge:       $JUDGE_MODEL"
echo "  Smart:       $SMART"
echo "  Max Qs:      ${MAX_QUESTIONS} (0=all)"
echo "  Call Delay:  ${CALL_DELAY}s"
echo "  Skip Ingest: $SKIP_INGEST"
echo "  Skip Extract:$SKIP_EXTRACTION"
echo "  Storage:     $OPENMIND_STORAGE_BACKEND (dual_write=$OPENMIND_STORAGE_DUAL_WRITE)"
echo "  Base:        ${OPENAI_BASE_URL:-api.openai.com}"
echo "============================================"
echo

# If we skip extraction, we won't have facts/anchors, so smart retrieval will return empty.
if [ "$SKIP_EXTRACTION" = "true" ]; then
    SMART="false"
fi

# Step 0: Check data file exists
if [ ! -f "$DATA_FILE" ]; then
    echo "ERROR: Data file not found: $DATA_FILE"
    echo ""
    echo "Please download the LongMemEval-S dataset and place it at:"
    echo "  $SCRIPT_DIR/$DATA_FILE"
    exit 1
fi

# Step 0.5: Install dependencies
echo "[0/5] Installing benchmark dependencies..."
pip install -q -r requirements.txt
echo

# Step 1: Ingest (direct — bypasses Bittensor network for speed)
if [ "$SKIP_INGEST" = "true" ]; then
    echo "[1/5] Skipping ingestion (SKIP_INGEST=true)"
else
    echo "[1/5] Ingesting sessions (direct mode — no network)..."
    python direct_ingest.py \
        --data "$DATA_FILE" \
        $MAX_Q_FLAG \
        $SKIP_EXTRACT_FLAG \
        --storage-backend "$OPENMIND_STORAGE_BACKEND" \
        $DUAL_WRITE_FLAG
    echo
    echo "  *** Please restart the miner now so it loads the new data. ***"
    echo "  Press ENTER when the miner is running again..."
    read -r
fi
echo

# Step 2: Retrieve
echo "[2/5] Retrieving answers via gateway..."
SMART_FLAG=""
if [ "$SMART" = "false" ]; then
    SMART_FLAG="--no-smart"
fi
python retrieve.py \
    --questions "$DATA_FILE" \
    --output "retrieval_${LABEL}.jsonl" \
    --api-url "$API_URL" \
    --top-k "$TOP_K" \
    $SMART_FLAG \
    $MAX_Q_FLAG
echo

# Step 3: Generate
echo "[3/5] Generating LLM answers..."
python generate.py \
    --retrieval "retrieval_${LABEL}.jsonl" \
    --output "generation_${LABEL}.jsonl" \
    --model "$MODEL" \
    --delay "$CALL_DELAY" \
    $API_KEY_FLAG \
    $BASE_URL_FLAG
echo

# Step 4: Evaluate
echo "[4/5] Evaluating with judge model..."
python evaluate.py \
    --generation "generation_${LABEL}.jsonl" \
    --ground-truth "$DATA_FILE" \
    --output "evaluation_${LABEL}.json" \
    --judge-model "$JUDGE_MODEL" \
    --delay "$CALL_DELAY" \
    $API_KEY_FLAG \
    $BASE_URL_FLAG
echo

# Step 5: Report
echo "[5/5] Generating comparison report..."
python report.py \
    --evaluation "evaluation_${LABEL}.json" \
    --retrieval "retrieval_${LABEL}.jsonl" \
    --output "report_${LABEL}.md" \
    --label "$LABEL"
echo

echo "============================================"
echo "  Benchmark complete!"
echo "  Report: report_${LABEL}.md"
echo "============================================"
