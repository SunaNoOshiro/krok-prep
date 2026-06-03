#!/usr/bin/env python3
"""Merge per-question enriched results into two output files.

Outputs:
  ../../src/data/imports/<BLOCK_ID>.enriched.json
      Full block with AI answer applied on high-confidence overrides;
      PDF original preserved under per-question `pdfOriginal`.

  ../../src/data/imports/<BLOCK_ID>-doubts.json
      Sidecar with schema `krok-question-doubts.v1` (template:
      ../resources/krok-question-doubts.v1.template.json). One entry per
      question where AI overrode the PDF OR validation flagged the answer
      as needing review.

Usage:
  cd .tmp_rewrite/<BLOCK_ID>_enrich
  python3 merge.py <BLOCK_ID>
"""
import datetime as dt
import json
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: merge.py <BLOCK_ID>")
    block_id = sys.argv[1]
    here = Path.cwd()
    repo_root = here.parent.parent
    src = repo_root / "src/data/imports" / f"{block_id}.json"
    results = here / "results"
    out_enriched = repo_root / "src/data/imports" / f"{block_id}.enriched.json"
    out_doubts = repo_root / "src/data/imports" / f"{block_id}-doubts.json"

    if not src.exists():
        sys.exit(f"source not found: {src}")
    if not results.exists():
        sys.exit(f"no results/ dir in {here}")

    src_data = json.loads(src.read_text())
    block = src_data["blocks"][0]
    original_by_number = {q["number"]: q for q in block["questions"]}

    enriched_questions: list[dict] = []
    doubt_items: list[dict] = []
    missing: list[int] = []

    for n in sorted(original_by_number):
        path = results / f"q{n:03d}.json"
        if not path.exists() or path.stat().st_size == 0:
            missing.append(n)
            enriched_questions.append(original_by_number[n])
            continue
        try:
            q = json.loads(path.read_text())
        except json.JSONDecodeError as e:
            print(f"  q{n:03d}: BAD JSON — {e}; falling back to source")
            missing.append(n)
            enriched_questions.append(original_by_number[n])
            continue

        enriched_questions.append(q)

        v = q.get("validation") or {}
        agreement = v.get("clinicalAgreement")
        confidence = v.get("confidence")
        needs_review = bool(v.get("needsReview"))
        overrode = agreement == "disagree" and confidence == "high" and "pdfOriginal" in q

        if overrode or needs_review:
            orig = original_by_number[n]
            review_type = (
                "ai_override_pdf" if overrode
                else ("clinical_uncertain" if agreement == "uncertain" else "low_confidence")
            )
            item = {
                "questionNumber": n,
                "questionId": q.get("id"),
                "question": q.get("question"),
                "options": q.get("options"),
                "pdfCorrectAnswer": orig.get("correctAnswerText"),
                "pdfCorrectAnswerKey": orig.get("correctAnswerKey"),
                "aiCorrectAnswer": q.get("correctAnswerText"),
                "aiCorrectAnswerKey": q.get("correctAnswerKey"),
                "reviewType": review_type,
                "confidence": confidence,
                "reason": v.get("reasoning"),
                "modelChosenKey": v.get("modelChosenKey"),
                "modelChosenText": v.get("modelChosenText"),
                "overrideApplied": overrode,
                "pdfOriginal": q.get("pdfOriginal"),
                "suggestedAction": (
                    "AI override applied — звірити з офіційним/навчальним джерелом перед мерджем у quizData.json."
                    if overrode
                    else "Низька впевненість моделі або неоднозначність — потрібна ручна клінічна звірка."
                ),
            }
            doubt_items.append(item)

    override_count = sum(1 for it in doubt_items if it["overrideApplied"])
    uncertain_count = len(doubt_items) - override_count
    now_iso = dt.datetime.now(dt.timezone.utc).isoformat()

    out_block = {
        **src_data,
        "generatedAt": now_iso,
        "sourceBlock": {
            **src_data.get("sourceBlock", {}),
            "description": (src_data.get("sourceBlock", {}).get("description") or "")
            + " | Validated and enriched with claude-opus-4-8 (hints + per-option whys; AI override applied on high-confidence clinical disagreements).",
        },
        "blocks": [{**block, "questions": enriched_questions}],
    }
    out_enriched.write_text(json.dumps(out_block, ensure_ascii=False, indent=2))

    doubts = {
        "schemaVersion": "krok-question-doubts.v1",
        "generatedAt": now_iso,
        "sourceBlockId": block["id"],
        "sourceFileName": block.get("source"),
        "summary": {
            "questionCount": len(enriched_questions),
            "reviewItemCount": len(doubt_items),
            "aiOverridePdfCount": override_count,
            "needsClinicalReviewCount": uncertain_count,
            "missingResultsCount": len(missing),
        },
        "items": doubt_items,
        "missingResults": missing,
    }
    out_doubts.write_text(json.dumps(doubts, ensure_ascii=False, indent=2))

    rel = lambda p: p.relative_to(repo_root)
    print(f"wrote {rel(out_enriched)}  ({len(enriched_questions)} questions)")
    print(f"wrote {rel(out_doubts)}    ({len(doubt_items)} doubt items: {override_count} AI overrides, {uncertain_count} needs-review)")
    if missing:
        print(f"warning: {len(missing)} missing enriched results: {missing[:10]}{'…' if len(missing) > 10 else ''}")


if __name__ == "__main__":
    main()
