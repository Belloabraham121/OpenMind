#!/usr/bin/env python3
"""
Generate a comparison report against SuperMemory's published LongMemEval scores.

Aggregates evaluation results, computes token reduction metrics, and
produces a markdown report with a comparison table.
"""

import argparse
import json
from pathlib import Path
from typing import Dict


SUPERMEMORY_SCORES = {
    "single-session-user": 97.14,
    "single-session-assistant": 96.43,
    "single-session-preference": 70.00,
    "knowledge-update": 88.46,
    "temporal-reasoning": 76.69,
    "multi-session": 71.43,
    "overall": 81.6,
}

OPENMIND_TARGETS = {
    "single-session-user": 98.0,
    "single-session-assistant": 98.0,
    "single-session-preference": 80.0,
    "knowledge-update": 90.0,
    "temporal-reasoning": 85.0,
    "multi-session": 80.0,
    "overall": 88.0,
}


def generate_report(
    eval_path: str,
    retrieval_path: str,
    output_path: str,
    run_label: str = "current",
):
    eval_data = json.loads(Path(eval_path).read_text(encoding="utf-8"))
    scores = eval_data.get("scores", {})

    total_tokens = 0
    n_queries = 0
    retrieval_file = Path(retrieval_path)
    if retrieval_file.exists():
        for line in retrieval_file.read_text(encoding="utf-8").strip().splitlines():
            entry = json.loads(line)
            total_tokens += entry.get("token_count", 0)
            n_queries += 1

    avg_tokens = total_tokens / n_queries if n_queries else 0

    lines = []
    lines.append(f"# OpenMind LongMemEval Benchmark Report — {run_label}")
    lines.append("")
    lines.append("## Accuracy Comparison")
    lines.append("")
    lines.append("| Category | SuperMemory (gpt-4o) | OpenMind Target | OpenMind Actual | Delta vs SM |")
    lines.append("|---|---|---|---|---|")

    for cat in [
        "single-session-user",
        "single-session-assistant",
        "single-session-preference",
        "knowledge-update",
        "temporal-reasoning",
        "multi-session",
        "overall",
    ]:
        sm = SUPERMEMORY_SCORES.get(cat, "N/A")
        target = OPENMIND_TARGETS.get(cat, "N/A")
        actual_data = scores.get(cat, {})
        actual = actual_data.get("accuracy", "N/A") if isinstance(actual_data, dict) else "N/A"

        if isinstance(actual, (int, float)) and isinstance(sm, (int, float)):
            delta = f"{actual - sm:+.2f}%"
        else:
            delta = "N/A"

        lines.append(f"| {cat} | {sm}% | {target}% | {actual}% | {delta} |")

    lines.append("")
    lines.append("## Token Efficiency")
    lines.append("")
    lines.append(f"- **Average tokens per query**: {avg_tokens:.0f}")
    lines.append(f"- **Total queries**: {n_queries}")
    lines.append(f"- **Total tokens**: {total_tokens}")

    # Estimate: raw episode retrieval would use ~1000 tokens per episode × top_k=20
    raw_estimate = 20 * 1000
    if avg_tokens > 0:
        reduction = (1 - avg_tokens / raw_estimate) * 100
        lines.append(f"- **Estimated raw retrieval tokens**: ~{raw_estimate} per query")
        lines.append(f"- **Token reduction**: {reduction:.1f}%")
    lines.append("")

    lines.append("## Per-Category Details")
    lines.append("")
    for cat, data in sorted(scores.items()):
        if isinstance(data, dict):
            lines.append(f"- **{cat}**: {data.get('accuracy', 'N/A')}% ({data.get('correct', 0)}/{data.get('total', 0)})")
    lines.append("")

    report = "\n".join(lines)
    Path(output_path).write_text(report, encoding="utf-8")
    print(report)
    print(f"\nReport saved to: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Generate LongMemEval comparison report")
    parser.add_argument("--evaluation", default="evaluation_results.json", help="Evaluation JSON input")
    parser.add_argument("--retrieval", default="retrieval_results.jsonl", help="Retrieval JSONL for token stats")
    parser.add_argument("--output", default="benchmark_report.md", help="Output markdown report")
    parser.add_argument("--label", default="current", help="Run label (e.g. 'baseline', 'v1.0')")
    args = parser.parse_args()
    generate_report(args.evaluation, args.retrieval, args.output, args.label)


if __name__ == "__main__":
    main()
