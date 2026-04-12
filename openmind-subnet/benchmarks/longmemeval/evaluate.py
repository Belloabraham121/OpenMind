#!/usr/bin/env python3
"""
Evaluate generated answers against LongMemEval ground truth.

Uses the official LongMemEval judge prompts from
``LongMemEval/src/evaluation/evaluate_qa.py`` (ICLR 2025): task-specific
prompts per ``question_type``, abstention handling when ``question_id`` ends
with ``_abs``, and yes/no scoring consistent with the paper implementation.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Dict, List

import backoff
import openai
from tqdm import tqdm

# Pinned OpenAI model ids from upstream LongMemEval ``model_zoo`` (optional resolution).
JUDGE_MODEL_RESOLVE = {
    "gpt-4o-mini": "gpt-4o-mini-2024-07-18",
    "gpt-4o": "gpt-4o-2024-08-06",
}


def get_anscheck_prompt(
    task: str,
    question: str,
    answer: str,
    response: str,
    abstention: bool = False,
) -> str:
    """
    Official LongMemEval judge prompt (verbatim from evaluate_qa.py).
    """
    if not abstention:
        if task in ["single-session-user", "single-session-assistant", "multi-session"]:
            template = (
                "I will give you a question, a correct answer, and a response from a model. "
                "Please answer yes if the response contains the correct answer. Otherwise, answer no. "
                "If the response is equivalent to the correct answer or contains all the intermediate steps "
                "to get the correct answer, you should also answer yes. If the response only contains a subset "
                "of the information required by the answer, answer no. \n\n"
                "Question: {}\n\nCorrect Answer: {}\n\nModel Response: {}\n\n"
                "Is the model response correct? Answer yes or no only."
            )
            prompt = template.format(question, answer, response)
        elif task == "temporal-reasoning":
            template = (
                "I will give you a question, a correct answer, and a response from a model. "
                "Please answer yes if the response contains the correct answer. Otherwise, answer no. "
                "If the response is equivalent to the correct answer or contains all the intermediate steps "
                "to get the correct answer, you should also answer yes. If the response only contains a subset "
                "of the information required by the answer, answer no. In addition, do not penalize off-by-one "
                "errors for the number of days. If the question asks for the number of days/weeks/months, etc., "
                "and the model makes off-by-one errors (e.g., predicting 19 days when the answer is 18), the model's "
                "response is still correct. \n\n"
                "Question: {}\n\nCorrect Answer: {}\n\nModel Response: {}\n\n"
                "Is the model response correct? Answer yes or no only."
            )
            prompt = template.format(question, answer, response)
        elif task == "knowledge-update":
            template = (
                "I will give you a question, a correct answer, and a response from a model. "
                "Please answer yes if the response contains the correct answer. Otherwise, answer no. "
                "If the response contains some previous information along with an updated answer, the response "
                "should be considered as correct as long as the updated answer is the required answer.\n\n"
                "Question: {}\n\nCorrect Answer: {}\n\nModel Response: {}\n\n"
                "Is the model response correct? Answer yes or no only."
            )
            prompt = template.format(question, answer, response)
        elif task == "single-session-preference":
            template = (
                "I will give you a question, a rubric for desired personalized response, and a response from a model. "
                "Please answer yes if the response satisfies the desired response. Otherwise, answer no. "
                "The model does not need to reflect all the points in the rubric. The response is correct as long as "
                "it recalls and utilizes the user's personal information correctly.\n\n"
                "Question: {}\n\nRubric: {}\n\nModel Response: {}\n\n"
                "Is the model response correct? Answer yes or no only."
            )
            prompt = template.format(question, answer, response)
        else:
            raise NotImplementedError(
                f"Unsupported LongMemEval question_type for official judge: {task!r}"
            )
    else:
        template = (
            "I will give you an unanswerable question, an explanation, and a response from a model. "
            "Please answer yes if the model correctly identifies the question as unanswerable. "
            "The model could say that the information is incomplete, or some other information is given but the "
            "asked information is not.\n\n"
            "Question: {}\n\nExplanation: {}\n\nModel Response: {}\n\n"
            "Does the model correctly identify the question as unanswerable? Answer yes or no only."
        )
        prompt = template.format(question, answer, response)
    return prompt


def resolve_judge_model(name: str) -> str:
    """Map short names to paper-style pinned ids when applicable."""
    return JUDGE_MODEL_RESOLVE.get(name, name)


@backoff.on_exception(backoff.expo, (openai.RateLimitError, openai.APIError), max_tries=5)
def judge_answer_official(
    client: openai.OpenAI,
    model: str,
    task: str,
    question: str,
    answer: str,
    hypothesis: str,
    abstention: bool,
) -> bool:
    """Official scoring: judge outputs yes/no; correct iff 'yes' in reply (case-insensitive)."""
    prompt = get_anscheck_prompt(task, question, answer, hypothesis, abstention=abstention)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        n=1,
        temperature=0,
        max_tokens=10,
    )
    eval_response = resp.choices[0].message.content or ""
    eval_response = eval_response.strip()
    return "yes" in eval_response.lower()


def _make_client(api_key: str = "", base_url: str = "") -> openai.OpenAI:
    """Create an OpenAI client; supports OpenRouter and other compatible APIs."""
    kwargs: Dict[str, str] = {}
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["base_url"] = base_url
    org = os.environ.get("OPENAI_ORGANIZATION")
    if org:
        kwargs["organization"] = org
    return openai.OpenAI(**kwargs)


def evaluate(
    generation_path: str,
    ground_truth_path: str,
    output_path: str,
    judge_model: str = "gpt-4o-mini",
    api_key: str = "",
    base_url: str = "",
    delay: float = 0.5,
    no_resolve_model: bool = False,
):
    client = _make_client(api_key, base_url)
    metric_model = judge_model if no_resolve_model else resolve_judge_model(judge_model)

    gen_lines = Path(generation_path).read_text(encoding="utf-8").strip().splitlines()
    generations = {json.loads(l)["question_id"]: json.loads(l) for l in gen_lines}

    gt_data = json.loads(Path(ground_truth_path).read_text(encoding="utf-8"))
    questions = gt_data if isinstance(gt_data, list) else gt_data.get("questions", gt_data.get("data", []))

    gt_lookup: Dict[str, dict] = {}
    for q in questions:
        qid = q.get("question_id") or q.get("id", "")
        gt_lookup[str(qid)] = q

    # Ground-truth order first, then any extra ids present only in generations (sorted).
    seen_gt_order = [str(q.get("question_id") or q.get("id", "")) for q in questions]
    ordered_ids = [qid for qid in seen_gt_order if qid and qid in generations]
    for qid in sorted(generations.keys(), key=str):
        if qid not in ordered_ids:
            ordered_ids.append(qid)

    category_results: Dict[str, List[bool]] = {}
    all_results: List[dict] = []
    calls_made = 0

    for qid in tqdm(ordered_ids, desc="Evaluating"):
        gen = generations[qid]
        gt = gt_lookup.get(str(qid))
        if not gt:
            print(f"  Warning: {qid} not in ground truth — skipping.", file=sys.stderr)
            continue

        task = gt.get("question_type") or gt.get("category", "")
        if not task:
            print(f"  Warning: missing question_type for {qid}, skipping.", file=sys.stderr)
            continue

        answer = gt.get("answer") or gt.get("reference_answer") or gt.get("expected", "")
        question = gt.get("question") or gen.get("question", "")
        hypothesis = gen.get("hypothesis", "")
        abstention = "_abs" in str(qid)

        if calls_made > 0 and delay > 0:
            time.sleep(delay)

        try:
            correct = judge_answer_official(
                client,
                metric_model,
                str(task),
                question,
                str(answer),
                hypothesis,
                abstention,
            )
            calls_made += 1
        except NotImplementedError as e:
            print(f"  Judge unsupported for {qid}: {e}", file=sys.stderr)
            correct = False
        except Exception as e:
            print(f"  Judge error for {qid}: {e}", file=sys.stderr)
            correct = False

        category = str(task)
        if category not in category_results:
            category_results[category] = []
        category_results[category].append(correct)

        all_results.append({
            "question_id": qid,
            "category": category,
            "question_type": category,
            "abstention": abstention,
            "correct": correct,
            "token_count": gen.get("token_count", 0),
            "judge_model": metric_model,
        })

    scores: Dict[str, Dict[str, float | int]] = {}
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
        "judge": "longmemeval_official_evaluate_qa",
        "judge_model": metric_model,
        "scores": scores,
        "details": all_results,
    }

    Path(output_path).write_text(
        json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\nEvaluation complete (official LongMemEval judge, model={metric_model}):")
    for cat, s in sorted(scores.items()):
        print(f"  {cat}: {s['accuracy']}% ({s['correct']}/{s['total']})")
    print(f"\nOutput: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate LongMemEval answers using official paper judge prompts"
    )
    parser.add_argument("--generation", default="generation_results.jsonl", help="Generation JSONL input")
    parser.add_argument("--ground-truth", default="longmemeval_s_cleaned.json", help="Ground truth JSON")
    parser.add_argument("--output", default="evaluation_results.json", help="Output JSON path")
    parser.add_argument(
        "--judge-model",
        default="gpt-4o-mini",
        help="Judge model (short names resolve to pinned ids: gpt-4o-mini, gpt-4o)",
    )
    parser.add_argument("--no-resolve-model", action="store_true", help="Pass judge model string through as-is")
    parser.add_argument("--api-key", default="", help="API key (or set OPENAI_API_KEY env var)")
    parser.add_argument("--base-url", default="", help="Base URL for OpenAI-compatible API")
    parser.add_argument("--delay", type=float, default=0.5, help="Seconds between judge calls (rate limiting)")
    args = parser.parse_args()
    evaluate(
        args.generation,
        args.ground_truth,
        args.output,
        args.judge_model,
        args.api_key,
        args.base_url,
        args.delay,
        args.no_resolve_model,
    )


if __name__ == "__main__":
    main()
