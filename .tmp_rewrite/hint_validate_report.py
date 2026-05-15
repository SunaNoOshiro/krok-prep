#!/usr/bin/env python3
"""Aggregate validation results and identify flagged hints (weak/broken)."""

import json
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "hint_validate_results"
BATCHES_DIR = ROOT / "hint_validate_batches"

def load_batch_questions(batch_num: int) -> dict:
    """Load the questions from a batch file for source/id mapping."""
    batch_file = BATCHES_DIR / f"validate_batch_{batch_num:03d}.json"
    if not batch_file.exists():
        return {}
    b = json.loads(batch_file.read_text(encoding="utf-8"))
    return {q["id"]: q["source"] for q in b.get("questions", [])}

def aggregate_results():
    """Aggregate all validation results."""
    by_source = defaultdict(lambda: {"ok": 0, "weak": 0, "broken": 0})
    flagged_hints = []

    for p in sorted(RESULTS.glob("validate_batch_*.json")):
        try:
            b = json.loads(p.read_text(encoding="utf-8"))
            batch_num = b.get("batch", int(p.stem.split("_")[-1]))
            batch_questions = load_batch_questions(batch_num)

            for verdict in b.get("verdicts", []):
                hint_id = verdict["id"]
                status = verdict["verdict"]
                source = batch_questions.get(hint_id, "unknown")

                by_source[source][status] += 1

                if status in ["weak", "broken"]:
                    flagged_hints.append({
                        "source": source,
                        "id": hint_id,
                        "status": status,
                        "issue": verdict.get("issue", ""),
                        "suggested": verdict.get("suggested", "")
                    })
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Warning: could not parse {p}: {e}")

    return by_source, flagged_hints

if __name__ == "__main__":
    if not RESULTS.exists():
        print(f"ERROR: {RESULTS} not found")
        exit(1)

    by_source, flagged_hints = aggregate_results()

    print("=== VALIDATION RESULTS ===\n")

    total_ok = 0
    total_weak = 0
    total_broken = 0

    for source in sorted(by_source.keys()):
        counts = by_source[source]
        ok, weak, broken = counts["ok"], counts["weak"], counts["broken"]
        total = ok + weak + broken
        total_ok += ok
        total_weak += weak
        total_broken += broken
        pct_ok = 100 * ok / total if total > 0 else 0
        print(f"{source:20} OK: {ok:3} ({pct_ok:5.1f}%)  Weak: {weak:3}  Broken: {broken:3}")

    print()
    total = total_ok + total_weak + total_broken
    pct_ok = 100 * total_ok / total if total > 0 else 0
    print(f"{'TOTAL':20} OK: {total_ok:3} ({pct_ok:5.1f}%)  Weak: {total_weak:3}  Broken: {total_broken:3}")

    if flagged_hints:
        print(f"\nFLAGGED HINTS: {len(flagged_hints)} remaining")
        flagged_file = ROOT / "flagged.json"
        flagged_file.write_text(
            json.dumps(flagged_hints, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        print(f"Saved to {flagged_file.name}")
    else:
        print("\n✅ All hints OK!")
