#!/usr/bin/env python3
"""Auto-fix common drift in enriched per-question results.

Run from inside .tmp_rewrite/<BLOCK_ID>_enrich/ — reads/writes results/q###.json.

Fixes applied (in order):
  1. Trim extra hint/why candidates beyond the 5 declared angles
     (keep first occurrence of each declared angle).
  2. Normalize hint candidate `risk` to "none" (text preserved).
  3. Resync `hint` to the text of the candidate matching `hintChoice.selectedAngle`.
  4. Resync each `answers[i].why` to its `whyChoice.selectedAngle` candidate.
  5. Force `answers[i].text == options[i]` (model sometimes normalizes Ukrainian
     noun cases in answers but leaves options original).
  6. Resync `correctAnswerText` to `answers[correctAnswer].text`.
"""
import json
import sys
from pathlib import Path

HINT_ANGLES = ["clinical-pattern", "mechanism", "framework", "attention-marker", "exclusion"]
WHY_ANGLES = ["definitional", "mechanism", "contrast", "clinical-context", "mnemonic"]


def dedup_by_angle(candidates: list, expected: list) -> list:
    seen: set[str] = set()
    kept: list = []
    for c in candidates:
        a = c.get("angle")
        if a in expected and a not in seen:
            seen.add(a)
            kept.append(c)
    return kept


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: autofix.py <BLOCK_ID>")
    # BLOCK_ID is not used directly — results/ is always in cwd —
    # but accepting it keeps the signature uniform with split.py / merge.py.
    _ = sys.argv[1]
    results = Path("results")
    if not results.exists():
        sys.exit(f"no results/ dir in {Path.cwd()}")

    touched: list[str] = []

    for f in sorted(results.glob("q*.json")):
        try:
            d = json.loads(f.read_text())
        except json.JSONDecodeError:
            continue  # validate.py will flag it
        changed = False

        hc = d.get("hintCandidates", [])
        new_hc = dedup_by_angle(hc, HINT_ANGLES)
        if new_hc != hc:
            d["hintCandidates"] = new_hc
            changed = True
        for c in d.get("hintCandidates", []):
            if c.get("risk") not in (None, "none"):
                c["risk"] = "none"
                changed = True

        sel = (d.get("hintChoice") or {}).get("selectedAngle")
        sel_text = next((c["text"] for c in d.get("hintCandidates", []) if c.get("angle") == sel), None)
        if sel_text and d.get("hint") != sel_text:
            d["hint"] = sel_text
            changed = True

        options = d.get("options", [])
        for i, a in enumerate(d.get("answers", [])):
            wcs = a.get("whyCandidates", [])
            new_wcs = dedup_by_angle(wcs, WHY_ANGLES)
            if new_wcs != wcs:
                a["whyCandidates"] = new_wcs
                changed = True
            wsel = (a.get("whyChoice") or {}).get("selectedAngle")
            wsel_text = next((c["text"] for c in a.get("whyCandidates", []) if c.get("angle") == wsel), None)
            if wsel_text and a.get("why") != wsel_text:
                a["why"] = wsel_text
                changed = True
            if i < len(options) and a.get("text") != options[i]:
                a["text"] = options[i]
                changed = True

        ca = d.get("correctAnswer")
        ans = d.get("answers", [])
        if isinstance(ca, int) and 0 <= ca < len(ans):
            if d.get("correctAnswerText") != ans[ca].get("text"):
                d["correctAnswerText"] = ans[ca].get("text")
                changed = True

        if changed:
            f.write_text(json.dumps(d, ensure_ascii=False, indent=2))
            touched.append(f.stem)

    print(f"autofix: touched {len(touched)} files" + (f": {touched}" if touched else ""))


if __name__ == "__main__":
    main()
