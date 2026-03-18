#!/usr/bin/env python3
"""
Generate answers using an LLM with retrieved context from OpenMind.

Takes the retrieval JSONL output, constructs prompts with retrieved context,
and calls an LLM to produce answers. Outputs JSONL with question_id and hypothesis.
"""

import argparse
import json
import sys
import time
from pathlib import Path

import backoff
import openai
from tqdm import tqdm


SYSTEM_PROMPT = """You are a helpful assistant answering questions about past conversations.
You will be given context retrieved from a memory system. Use ONLY the provided context
to answer the question. If the context doesn't contain enough information, say so.
Be concise and accurate."""


@backoff.on_exception(backoff.expo, (openai.RateLimitError, openai.APIError), max_tries=5)
def call_llm(client: openai.OpenAI, model: str, context: str, question: str) -> str:
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"},
        ],
        temperature=0.0,
        max_tokens=500,
    )
    return resp.choices[0].message.content.strip()


def _make_client(api_key: str = "", base_url: str = "") -> openai.OpenAI:
    """Create an OpenAI client, supporting OpenRouter and other compatible APIs."""
    kwargs = {}
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["base_url"] = base_url
    return openai.OpenAI(**kwargs)


def generate(
    retrieval_path: str,
    output_path: str,
    model: str = "gpt-4o-mini",
    api_key: str = "",
    base_url: str = "",
    delay: float = 0.5,
):
    client = _make_client(api_key, base_url)

    # Stream JSONL to avoid loading huge files into memory.
    # Also skip malformed lines (e.g. if a previous run was interrupted).
    results = []
    calls_made = 0

    with open(retrieval_path, "r", encoding="utf-8") as f:
        for line in tqdm(f, desc="Generating answers"):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"  Skipping malformed JSONL line: {e}", file=sys.stderr)
                continue
            qid = entry["question_id"]
            question = entry["question"]
            context = entry.get("context_text", "")

            if not context.strip():
                hypothesis = "I don't have enough context to answer this question."
            else:
                if calls_made > 0 and delay > 0:
                    time.sleep(delay)
                try:
                    hypothesis = call_llm(client, model, context, question)
                    calls_made += 1
                except Exception as e:
                    print(f"  Error generating for {qid}: {e}", file=sys.stderr)
                    hypothesis = f"Error: {e}"

            results.append({
                "question_id": qid,
                "question": question,
                "category": entry.get("category", ""),
                "hypothesis": hypothesis,
                "token_count": entry.get("token_count", 0),
            })

    with open(output_path, "w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\nGeneration complete: {len(results)} answers produced ({calls_made} LLM calls).")
    print(f"Output: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Generate LLM answers from retrieved context")
    parser.add_argument("--retrieval", default="retrieval_results.jsonl", help="Retrieval JSONL input")
    parser.add_argument("--output", default="generation_results.jsonl", help="Output JSONL path")
    parser.add_argument("--model", default="gpt-4o-mini", help="LLM model name")
    parser.add_argument("--api-key", default="", help="API key (or set OPENAI_API_KEY env var)")
    parser.add_argument("--base-url", default="", help="Base URL for OpenAI-compatible API")
    parser.add_argument("--delay", type=float, default=0.5, help="Seconds to wait between LLM calls (rate limiting)")
    args = parser.parse_args()
    generate(args.retrieval, args.output, args.model, args.api_key, args.base_url, args.delay)


if __name__ == "__main__":
    main()
