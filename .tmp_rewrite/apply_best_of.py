#!/usr/bin/env python3
"""Apply best-of selections to source data files."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "hint_best_of_results"
BATCHES = ROOT / "hint_best_of_batches"
DATA = ROOT.parent / "src" / "data"

SOURCES = {
    "edkiData": DATA / "edkiData.json",
    "quizData": DATA / "quizData.json",
    "selfControlData": DATA / "selfControlData.json",
    "krok-file-8": DATA / "imports" / "krok-file-8.json",
}

def load_selections() -> dict:
    """Load best-of selections, mapped by (source, id) -> best_hint."""
    by_key = {}

    # Need to cross-reference with batch files to get source for each id
    for p in sorted(RESULTS.glob("best_of_batch_*.json")):
        try:
            result = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"Warning: could not parse {p.name}")
            continue

        # Load corresponding batch to get source mapping
        batch_file = BATCHES / p.name
        try:
            batch = json.loads(batch_file.read_text(encoding="utf-8"))
            id_to_source = {item["id"]: item["source"] for item in batch.get("selections", [])}
        except (json.JSONDecodeError, FileNotFoundError):
            continue

        for sel in result.get("selections", []):
            hint_id = sel.get("id")
            best_hint = sel.get("best_hint")
            source = id_to_source.get(hint_id)
            if source and best_hint:
                by_key[(source, hint_id)] = best_hint

    return by_key

def apply_to_source(name: str, path: Path, selections: dict) -> int:
    """Apply best-of selections to a source file."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    questions = raw["blocks"][0]["questions"] if name == "krok-file-8" else raw

    patched = 0
    for q in questions:
        key = (name, q["id"])
        if key in selections:
            q["hint"] = selections[key]
            patched += 1

    path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    return patched

if __name__ == "__main__":
    if not RESULTS.exists():
        print(f"ERROR: {RESULTS} not found")
        exit(1)

    selections = load_selections()
    print(f"Loaded {len(selections)} best-of selections")

    print("\nApplying to source files:")
    total = 0
    for name in sorted(SOURCES.keys()):
        patched = apply_to_source(name, SOURCES[name], selections)
        total += patched
        print(f"  {name}: {patched} hints updated to best variant")

    print(f"\n✓ Total: {total} hints updated with best variants")
