#!/usr/bin/env python3
"""Structurally validate every per-question result in results/.

Reports issue counts and a sample of raw findings. Exits 0 if all clean,
1 if any issues remain (so it can gate the merge step in CI).
"""
import json
import sys
from pathlib import Path

REQUIRED_TOP = (
    "id", "number", "blockId", "question", "options", "answers",
    "correctAnswer", "correctAnswerKey", "correctAnswerText",
    "validation", "hintCandidates", "hintChoice", "hint",
    "enrichedAt", "enrichedBy",
)
HINT_ANGLES = {"clinical-pattern", "mechanism", "framework", "attention-marker", "exclusion"}
WHY_ANGLES = {"definitional", "mechanism", "contrast", "clinical-context", "mnemonic"}


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: validate.py <BLOCK_ID>")
    _ = sys.argv[1]
    results = Path("results")
    if not results.exists():
        sys.exit(f"no results/ dir in {Path.cwd()}")

    issues: list[tuple[str, str, object]] = []

    for f in sorted(results.glob("q*.json")):
        qid = f.stem
        try:
            d = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            issues.append((qid, "BAD_JSON", str(e)))
            continue

        for k in REQUIRED_TOP:
            if k not in d:
                issues.append((qid, "missing_field", k))

        hc = d.get("hintCandidates", [])
        if len(hc) != 5:
            issues.append((qid, "hintCandidates_count", len(hc)))
        if {c.get("angle") for c in hc} != HINT_ANGLES:
            issues.append((qid, "hint_angles", {c.get("angle") for c in hc}))
        bad_risk = [c.get("angle") for c in hc if c.get("risk") not in (None, "none")]
        if bad_risk:
            issues.append((qid, "hint_risk_not_none", bad_risk))
        sel = (d.get("hintChoice") or {}).get("selectedAngle")
        sel_text = next((c.get("text") for c in hc if c.get("angle") == sel), None)
        if sel_text != d.get("hint"):
            issues.append((qid, "hint_text_mismatch", sel))

        answers = d.get("answers", [])
        options = d.get("options", [])
        if len(answers) != len(options):
            issues.append((qid, "answers_count_neq_options", f"{len(answers)} vs {len(options)}"))
        if sum(1 for a in answers if a.get("isCorrect")) != 1:
            issues.append((qid, "isCorrect_count", "!=1"))

        for i, a in enumerate(answers):
            wcs = a.get("whyCandidates", [])
            if len(wcs) != 5:
                issues.append((qid, f"why_count_{a.get('key')}", len(wcs)))
            if {c.get("angle") for c in wcs} != WHY_ANGLES:
                issues.append((qid, f"why_angles_{a.get('key')}", "bad"))
            wsel = (a.get("whyChoice") or {}).get("selectedAngle")
            wsel_text = next((c.get("text") for c in wcs if c.get("angle") == wsel), None)
            if wsel_text != a.get("why"):
                issues.append((qid, f"why_text_mismatch_{a.get('key')}", wsel))
            if i < len(options) and a.get("text") != options[i]:
                issues.append((qid, f"answer_text_neq_option_{i}", f"'{a.get('text')[:40]}' vs '{options[i][:40]}'"))

        ca = d.get("correctAnswer")
        cak = d.get("correctAnswerKey")
        cat = d.get("correctAnswerText")
        if isinstance(ca, int) and 0 <= ca < len(answers):
            if answers[ca].get("key") != cak:
                issues.append((qid, "correctAnswer_key_inconsistent", cak))
            if answers[ca].get("text") != cat:
                issues.append((qid, "correctAnswer_text_inconsistent", cat))
            if not answers[ca].get("isCorrect"):
                issues.append((qid, "correctAnswer_isCorrect_false", ca))
        else:
            issues.append((qid, "correctAnswer_bad_index", ca))

    total = sum(1 for _ in results.glob("q*.json"))
    print(f"validate: {len(issues)} issues across {total} questions")
    for q, kind, detail in issues[:40]:
        print(f"  {q}: {kind}: {detail}")
    if len(issues) > 40:
        print(f"  ... and {len(issues) - 40} more")

    sys.exit(0 if not issues else 1)


if __name__ == "__main__":
    main()
