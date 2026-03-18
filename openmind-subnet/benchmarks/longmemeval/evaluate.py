#!/usr/bin/env python3
"""
Evaluate generated answers against LongMemEval ground truth.

Uses GPT-4o as a judge with task-specific prompts to score each answer.
Outputs per-category accuracy scores.
"""

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, List

import backoff
import openai
from tqdm import tqdm


JUDGE_PROMPT = """You are evaluating whether an AI assistant correctly answered a question
about past conversations. You have the ground truth reference answer.

Question: {question}
Reference Answer: {reference}
Generated Answer: {hypothesis}

Does the generated answer correctly address the question based on the reference?
Consider:
- Factual accuracy (most important)
- Completeness (does it cover the key points?)
- No hallucination (does it add false information?)

Respond with ONLY a JSON object: {{"correct": true}} or {{"correct": false}}"""


@backoff.on_exception(backoff.expo, (openai.RateLimitError, openai.APIError), max_tries=5)
def judge_answer(
    client: openai.OpenAI,
    model: str,
    question: str,
    reference: str,
    hypothesis: str,
) -> bool:
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "user", "content": JUDGE_PROMPT.format(
                question=question,
                reference=reference,
                hypothesis=hypothesis,
            )},
        ],
        temperature=0.0,
        max_tokens=50,
    )
    text = resp.choices[0].message.content.strip()
    try:
        result = json.loads(text)
        return bool(result.get("correct", False))
    except json.JSONDecodeError:
        return "true" in text.lower()


def _make_client(api_key: str = "", base_url: str = "") -> openai.OpenAI:
    """Create an OpenAI client, supporting OpenRouter and other compatible APIs."""
    kwargs = {}
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["base_url"] = base_url
    return openai.OpenAI(**kwargs)


def evaluate(
    generation_path: str,
    ground_truth_path: str,
    output_path: str,
    judge_model: str = "gpt-4o-mini",
    api_key: str = "",
    base_url: str = "",
    delay: float = 0.5,
):
    client = _make_client(api_key, base_url)

    gen_lines = Path(generation_path).read_text(encoding="utf-8").strip().splitlines()
    generations = {json.loads(l)["question_id"]: json.loads(l) for l in gen_lines}

    gt_data = json.loads(Path(ground_truth_path).read_text(encoding="utf-8"))
    questions = gt_data if isinstance(gt_data, list) else gt_data.get("questions", gt_data.get("data", []))

    gt_lookup = {}
    for q in questions:
        qid = q.get("question_id") or q.get("id", "")
        gt_lookup[str(qid)] = q

    category_results: Dict[str, List[bool]] = {}
    all_results = []
    calls_made = 0

    for qid, gen in tqdm(generations.items(), desc="Evaluating"):
        gt = gt_lookup.get(str(qid))
        if not gt:
            continue

        reference = gt.get("answer") or gt.get("reference_answer") or gt.get("expected", "")
        hypothesis = gen.get("hypothesis", "")
        question = gen.get("question", "")
        category = gen.get("category") or gt.get("question_type") or gt.get("category", "unknown")

        if calls_made > 0 and delay > 0:
            time.sleep(delay)

        try:
            correct = judge_answer(client, judge_model, question, reference, hypothesis)
            calls_made += 1
        except Exception as e:
            print(f"  Judge error for {qid}: {e}", file=sys.stderr)
            correct = False

        if category not in category_results:
            category_results[category] = []
        category_results[category].append(correct)

        all_results.append({
            "question_id": qid,
            "category": category,
            "correct": correct,
            "token_count": gen.get("token_count", 0),
        })

    scores = {}
    for cat, results in sorted(category_results.items()):
        acc = sum(results) / len(results) * 100 if results else 0
        scores[cat] = {"accuracy": round(acc, 2), "total": len(results), "correct": sum(results)}

    total_correct = sum(r["correct"] for r in all_results)
    total = len(all_results)
    scores["overall"] = {
        "accuracy": round(total_correct / total * 100, 2) if total else 0,
        "total": total,
        "correct": total_correct,
    }

    output = {
        "scores": scores,
        "details": all_results,
    }

    Path(output_path).write_text(
        json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\nEvaluation complete:")
    for cat, s in sorted(scores.items()):
        print(f"  {cat}: {s['accuracy']}% ({s['correct']}/{s['total']})")
    print(f"\nOutput: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Evaluate LongMemEval answers")
    parser.add_argument("--generation", default="generation_results.jsonl", help="Generation JSONL input")
    parser.add_argument("--ground-truth", default="longmemeval_s_cleaned.json", help="Ground truth JSON")
    parser.add_argument("--output", default="evaluation_results.json", help="Output JSON path")
    parser.add_argument("--judge-model", default="gpt-4o-mini", help="Judge model")
    parser.add_argument("--api-key", default="", help="API key (or set OPENAI_API_KEY env var)")
    parser.add_argument("--base-url", default="", help="Base URL for OpenAI-compatible API")
    parser.add_argument("--delay", type=float, default=0.5, help="Seconds to wait between judge calls (rate limiting)")
    args = parser.parse_args()
    evaluate(args.generation, args.ground_truth, args.output, args.judge_model, args.api_key, args.base_url, args.delay)


if __name__ == "__main__":
    main()
