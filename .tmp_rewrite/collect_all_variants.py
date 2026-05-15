#!/usr/bin/env python3
"""Collect all hint variants from all rewrite rounds for each (source, id)."""

import json
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / "src" / "data"

# Collects variants from any rewrite_results directory.
# Add/remove rounds here as you accumulate them across runs.
ROUNDS = {
    p.name.replace("hint_rewrite_", "").replace("_results", ""): p
    for p in ROOT.glob("hint_rewrite*_results")
    if p.is_dir()
}

SOURCES = {
    "edkiData": DATA / "edkiData.json",
    "quizData": DATA / "quizData.json",
    "selfControlData": DATA / "selfControlData.json",
    "krok-file-8": DATA / "imports" / "krok-file-8.json",
}

def collect_variants():
    """Collect all hint variants for each (source, id)."""
    variants = defaultdict(dict)  # {(source, id): {round: hint}}

    for round_name, results_dir in ROUNDS.items():
        if not results_dir.exists():
            continue
        for p in sorted(results_dir.glob("*.json")):
            try:
                b = json.loads(p.read_text(encoding="utf-8"))
                for rw in b.get("rewrites", []):
                    if "source" in rw and "id" in rw and "new_hint" in rw:
                        key = (rw["source"], rw["id"])
                        variants[key][round_name] = rw["new_hint"]
            except json.JSONDecodeError:
                pass

    # Also add current hint from source files
    for name, path in SOURCES.items():
        raw = json.loads(path.read_text(encoding="utf-8"))
        questions = raw["blocks"][0]["questions"] if name == "krok-file-8" else raw
        for q in questions:
            key = (name, q["id"])
            if "hint" in q:
                variants[key]["current"] = q["hint"]

    return variants

def get_questions():
    """Load all questions with full context."""
    all_q = {}
    for name, path in SOURCES.items():
        raw = json.loads(path.read_text(encoding="utf-8"))
        questions = raw["blocks"][0]["questions"] if name == "krok-file-8" else raw
        for q in questions:
            key = (name, q["id"])
            # Get correct answer
            correct_idx = q.get("correctAnswer", 0)
            options = q.get("options", [])
            answer = options[correct_idx] if correct_idx < len(options) else ""
            all_q[key] = {
                "source": name,
                "id": q["id"],
                "question": q.get("question", ""),
                "answer": answer,
                "options": options,
            }
    return all_q

if __name__ == "__main__":
    variants = collect_variants()
    questions = get_questions()

    print(f"Total hints with variants: {len(variants)}")

    # Stats
    counts = defaultdict(int)
    for v in variants.values():
        counts[len(v)] += 1

    print("\nVariants per hint:")
    for n in sorted(counts.keys()):
        print(f"  {n} variants: {counts[n]} hints")

    # Build best-of batches (only hints with 2+ variants)
    multi = [(k, v) for k, v in variants.items() if len(v) >= 2]
    print(f"\nHints with 2+ variants (need selection): {len(multi)}")

    # Save raw variants for inspection
    variants_export = []
    for (source, hint_id), opts in sorted(multi):
        q = questions.get((source, hint_id), {})
        variants_export.append({
            "source": source,
            "id": hint_id,
            "question": q.get("question", ""),
            "answer": q.get("answer", ""),
            "variants": opts
        })

    Path(ROOT / "all_variants.json").write_text(
        json.dumps(variants_export, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"\nSaved to all_variants.json")
