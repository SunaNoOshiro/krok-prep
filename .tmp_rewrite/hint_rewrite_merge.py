#!/usr/bin/env python3
"""Merge rewrite results back into source data files (only flagged hints)."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "hint_rewrite_results"
DATA = ROOT.parent / "src" / "data"
FLAGGED_FILE = ROOT / "flagged.json"

SOURCES = {
    "edkiData": DATA / "edkiData.json",
    "quizData": DATA / "quizData.json",
    "selfControlData": DATA / "selfControlData.json",
    "krok-file-8": DATA / "imports" / "krok-file-8.json",
}

def load_rewrites() -> dict:
    """Load all rewrites indexed by (source, id)."""
    by_key = {}
    for p in sorted(RESULTS.glob("rewrite_batch_*.json")):
        try:
            b = json.loads(p.read_text(encoding="utf-8"))
            for rw in b.get("rewrites", []):
                key = (rw["source"], rw["id"])
                by_key[key] = rw["new_hint"]
        except json.JSONDecodeError:
            print(f"Warning: could not parse {p}")
    return by_key

def load_flagged() -> set:
    """Load set of (source, id) that should be updated."""
    if not FLAGGED_FILE.exists():
        return None
    flagged = json.loads(FLAGGED_FILE.read_text(encoding="utf-8"))
    return {(f["source"], f["id"]) for f in flagged}

def merge_one(name: str, path: Path, rewrites: dict, flagged: set) -> tuple[int, int]:
    """Update only flagged hints in a source file."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    questions = raw["blocks"][0]["questions"] if name == "krok-file-8" else raw

    patched = 0
    for q in questions:
        key = (name, q["id"])
        if flagged and key in flagged and key in rewrites:
            q["hint"] = rewrites[key]
            patched += 1

    path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    return (patched, len(questions))

if __name__ == "__main__":
    if not RESULTS.exists():
        print(f"ERROR: {RESULTS} not found")
        exit(1)

    rewrites = load_rewrites()
    flagged = load_flagged()

    if flagged:
        print(f"Merging up to {len(flagged)} rewrites (focused mode)")
    else:
        print("Merging rewrites (no flagged file)")

    total_patched = 0
    for name in sorted(SOURCES.keys()):
        patched, total = merge_one(name, SOURCES[name], rewrites, flagged)
        total_patched += patched
        print(f"{name}: patched {patched}/{total}")

    print(f"\n✓ Total: {total_patched} hints updated")
