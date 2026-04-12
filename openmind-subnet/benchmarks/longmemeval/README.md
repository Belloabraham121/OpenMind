# LongMemEval Benchmark for OpenMind

Measures OpenMind's long-term memory retrieval accuracy and token efficiency against the [LongMemEval](https://github.com/xiaowu0162/LongMemEval) benchmark, with direct comparison to SuperMemory.ai's published scores.

## Prerequisites

1. A running OpenMind subnet (miner + validator with gateway) at `http://localhost:8090`
2. The `longmemeval_s_cleaned.json` dataset (LongMemEval-S, ~500 questions across ~40 sessions)
3. An OpenAI API key set via `OPENAI_API_KEY` environment variable
4. [Ollama](https://ollama.ai) running locally with the `nomic-embed-text` model pulled (`ollama pull nomic-embed-text`)

## Quick Start

```bash
# Place the dataset in this directory
cp /path/to/longmemeval_s_cleaned.json .

# Make sure Ollama is running with the embedding model
ollama pull nomic-embed-text

# Run the full benchmark
export OPENAI_API_KEY="sk-..."
MAX_QUESTIONS=20 ./run_all.sh
```

## Pipeline Steps

| Step | Script | Description |
|------|--------|-------------|
| 1 | `direct_ingest.py` | Chunks conversations per-turn-pair, generates embeddings via Ollama, writes to miner storage |
| 2 | `retrieve.py` | Embeds each question via Ollama, queries via POST /v1/memory/query, deduplicates, logs token counts |
| 3 | `generate.py` | Sends retrieved context + question to LLM to produce answers |
| 4 | `evaluate.py` | Official LongMemEval judge (`evaluate_qa.py` prompts: per `question_type`, abstention via `_abs`; yes/no; `max_tokens=10`) |
| 5 | `report.py` | Generates comparison table vs SuperMemory's published scores |

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:8090` | OpenMind gateway URL |
| `DATA_FILE` | `longmemeval_s_cleaned.json` | Input dataset path |
| `MODEL` | `gpt-4o-mini` | LLM for answer generation |
| `JUDGE_MODEL` | `gpt-4o-mini` | Metric model; short names resolve to pinned ids like upstream LongMemEval |
| `LABEL` | timestamp | Run label for output files |
| `SMART` | `true` | Use two-phase smart retrieval |
| `TOP_K` | `20` | Number of results to retrieve |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint for embeddings |
| `EMBED_MODEL` | `nomic-embed-text` | Ollama embedding model name |
| `SKIP_EMBEDDINGS` | `false` | Skip embedding generation (keyword-only fallback) |
| `SKIP_EXTRACTION` | `false` | Skip fact extraction (faster, uses episode-level retrieval) |
| `TURNS_PER_CHUNK` | `4` | Max conversation turns per chunk (lower = more precise, more chunks) |
| `MAX_QUESTIONS` | `0` | Limit number of questions (0 = all) |

## Comparing Baseline vs Architecture

```bash
# Run with embeddings + chunking (recommended)
LABEL=v2-embed MAX_QUESTIONS=50 ./run_all.sh

# Run without embeddings (keyword-only baseline)
LABEL=v2-keyword SKIP_EMBEDDINGS=true MAX_QUESTIONS=50 ./run_all.sh

# Compare the reports
diff report_v2-keyword.md report_v2-embed.md
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
