#!/usr/bin/env python3
"""Merge rewritten batch result files back into original JSON sources.

Reads `results/<name>_batch_<NNN>.json` (same shape as the batch input but
with rewritten `explanation`, `answers[].why`, `explanationDetails`) and
patches the matching question objects in the source JSON files by `id`.

Schema unification:
- Every question gets `answers: [{key, text, isCorrect, why}, ...]` with one
  entry per option in the same order as `options[]`.
- `explanation` is the human-readable combined text (used as fallback when
  the structured renderer isn't active).
- `explanationDetails` is { correct, incorrect: { <option text> -> why } }
  so it's robust to option shuffling.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "results"
DATA = ROOT.parent / "src" / "data"


def load_results(name: str):
    """Return dict: id -> rewritten question object."""
    merged = {}
    for p in sorted(RESULTS.glob(f"{name}_batch_*.json")):
        bundle = json.loads(p.read_text(encoding="utf-8"))
        for q in bundle["questions"]:
            merged[q["id"]] = q
    return merged


def normalize_answers(original, rewritten):
    """Ensure answers[] matches options order, has all required fields."""
    options = original["options"]
    correct_idx = original["correctAnswer"]
    keys = ["a", "b", "c", "d", "e", "f", "g"]

    rewritten_answers = rewritten.get("answers", [])
    # Build lookup by text -> why
    why_by_text = {}
    for a in rewritten_answers:
        if "text" in a and "why" in a:
            why_by_text[a["text"]] = a["why"]

    out = []
    for i, opt_text in enumerate(options):
        why = why_by_text.get(opt_text, "")
        out.append(
            {
                "key": keys[i],
                "text": opt_text,
                "isCorrect": i == correct_idx,
                "why": why,
            }
        )
    return out


def build_explanation_details(answers, correct_text, correct_why):
    return {
        "correct": correct_why,
        "incorrect": {a["text"]: a["why"] for a in answers if not a["isCorrect"]},
    }


def merge_into_question(orig, rewritten):
    """Patch fields in orig with rewritten content; preserve everything else."""
    orig["answers"] = normalize_answers(orig, rewritten)
    if "explanation" in rewritten:
        orig["explanation"] = rewritten["explanation"]

    correct_idx = orig["correctAnswer"]
    correct_text = orig["options"][correct_idx]
    correct_answer = next((a for a in orig["answers"] if a["isCorrect"]), None)
    correct_why = correct_answer["why"] if correct_answer else ""
    orig["explanationDetails"] = build_explanation_details(
        orig["answers"], correct_text, correct_why
    )
    # Keep convenience fields if they exist in original schema
    if "correctAnswerKey" in orig:
        orig["correctAnswerKey"] = orig["answers"][correct_idx]["key"]
    if "correctAnswerText" in orig:
        orig["correctAnswerText"] = correct_text
    return orig


def merge_flat(name: str, src_path: Path):
    data = json.loads(src_path.read_text(encoding="utf-8"))
    results = load_results(name)
    patched = 0
    for q in data:
        r = results.get(q["id"])
        if r:
            merge_into_question(q, r)
            patched += 1
    src_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return patched, len(data)


def merge_blocks(name: str, src_path: Path):
    data = json.loads(src_path.read_text(encoding="utf-8"))
    qs = data["blocks"][0]["questions"]
    results = load_results(name)
    patched = 0
    for q in qs:
        r = results.get(q["id"])
        if r:
            merge_into_question(q, r)
            patched += 1
    src_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return patched, len(qs)


JOBS = {
    "krok-file-8": ("blocks", DATA / "imports" / "krok-file-8.json"),
    "edkiData": ("flat", DATA / "edkiData.json"),
    "quizData": ("flat", DATA / "quizData.json"),
    "selfControlData": ("flat", DATA / "selfControlData.json"),
}


if __name__ == "__main__":
    targets = sys.argv[1:] or list(JOBS.keys())
    for name in targets:
        kind, path = JOBS[name]
        if kind == "blocks":
            patched, total = merge_blocks(name, path)
        else:
            patched, total = merge_flat(name, path)
        print(f"{name}: patched {patched}/{total} questions in {path}")
