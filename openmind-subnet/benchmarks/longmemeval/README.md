# LongMemEval Benchmark for OpenMind

Measures OpenMind's long-term memory retrieval accuracy and token efficiency against the [LongMemEval](https://github.com/xiaowu0162/LongMemEval) benchmark, with direct comparison to SuperMemory.ai's published scores.

## Prerequisites

1. A running OpenMind subnet (miner + validator with gateway) at `http://localhost:8090`
2. The `longmemeval_s_cleaned.json` dataset (LongMemEval-S, ~500 questions across ~40 sessions)
3. An OpenAI API key set via `OPENAI_API_KEY` environment variable

## Quick Start

```bash
# Place the dataset in this directory
cp /path/to/longmemeval_s_cleaned.json .

# Run the full benchmark
export OPENAI_API_KEY="sk-..."
./run_all.sh
```

## Pipeline Steps

| Step | Script | Description |
|------|--------|-------------|
| 1 | `ingest.py` | Ingests all conversation sessions via POST /v1/memory/store |
| 2 | `retrieve.py` | Queries each question via POST /v1/memory/query, logs token counts |
| 3 | `generate.py` | Sends retrieved context + question to GPT-4o to produce answers |
| 4 | `evaluate.py` | GPT-4o judge scores each answer against ground truth |
| 5 | `report.py` | Generates comparison table vs SuperMemory's published scores |

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:8090` | OpenMind gateway URL |
| `DATA_FILE` | `longmemeval_s_cleaned.json` | Input dataset path |
| `MODEL` | `gpt-4o` | LLM for answer generation |
| `LABEL` | timestamp | Run label for output files |
| `SMART` | `true` | Use two-phase smart retrieval |
| `TOP_K` | `20` | Number of results to retrieve |

## Comparing Baseline vs Architecture

```bash
# Baseline run (before architecture changes, using legacy retrieval)
LABEL=baseline SMART=false ./run_all.sh

# Post-architecture run (with smart retrieval)
LABEL=v1-smart SMART=true ./run_all.sh

# Compare the reports
diff report_baseline.md report_v1-smart.md
```

## Target Scores vs SuperMemory (gpt-4o)

| Category | SuperMemory | OpenMind Target |
|---|---|---|
| single-session-user | 97.14% | 98%+ |
| single-session-assistant | 96.43% | 98%+ |
| single-session-preference | 70.00% | 80%+ |
| knowledge-update | 88.46% | 90%+ |
| temporal-reasoning | 76.69% | 85%+ |
| multi-session | 71.43% | 80%+ |
| Overall | 81.6% | 88%+ |
