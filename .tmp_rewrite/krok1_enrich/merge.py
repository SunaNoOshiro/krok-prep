#!/usr/bin/env python3
"""Merge per-question enriched results into two output files:

  src/data/imports/krok-file-1.enriched.json
      All 149 enriched questions in the same block structure as the source.
      For mismatches, the AI's answer is applied (correctAnswer/Key/Text
      swapped); the original PDF answer is preserved under `pdfOriginal`.

  src/data/imports/krok-file-1-doubts.json
      Sidecar mirroring src/data/imports/krok-file-8-doubts.json.
      One entry per question where the model overrode the PDF
      (clinicalAgreement === 'disagree' AND confidence === 'high')
      OR where validation.needsReview is true (uncertain / low confidence).
"""
import json
import datetime as dt
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = ROOT / "src/data/imports/krok-file-1.json"
RESULTS = HERE / "results"
OUT_ENRICHED = ROOT / "src/data/imports/krok-file-1.enriched.json"
OUT_DOUBTS = ROOT / "src/data/imports/krok-file-1-doubts.json"


def main() -> None:
    src = json.loads(SRC.read_text())
    block = src["blocks"][0]
    original_by_number = {q["number"]: q for q in block["questions"]}

    enriched_questions: list[dict] = []
    doubt_items: list[dict] = []
    missing: list[int] = []

    for n in sorted(original_by_number):
        path = RESULTS / f"q{n:03d}.json"
        if not path.exists() or path.stat().st_size == 0:
            missing.append(n)
            # fall back to the original (unenriched) question so the block stays complete
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
            pdf_original = q.get("pdfOriginal")  # only present when overrode
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
                "pdfOriginal": pdf_original,
                "suggestedAction": (
                    "AI override applied — звірити з офіційним/навчальним джерелом перед мерджем у quizData.json."
                    if overrode
                    else "Низька впевненість моделі або неоднозначність — потрібна ручна клінічна звірка."
                ),
            }
            doubt_items.append(item)

    override_count = sum(1 for it in doubt_items if it["overrideApplied"])
    uncertain_count = len(doubt_items) - override_count

    out_block = {
        **src,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sourceBlock": {
            **src.get("sourceBlock", {}),
            "description": (src.get("sourceBlock", {}).get("description") or "")
            + " | Validated and enriched with claude-opus-4-7 (hints + per-option whys; AI override applied on high-confidence clinical disagreements).",
        },
        "blocks": [
            {
                **block,
                "questions": enriched_questions,
            }
        ],
    }
    OUT_ENRICHED.write_text(json.dumps(out_block, ensure_ascii=False, indent=2))

    doubts = {
        "schemaVersion": "krok-question-doubts.v1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
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
    OUT_DOUBTS.write_text(json.dumps(doubts, ensure_ascii=False, indent=2))

    print(f"wrote {OUT_ENRICHED.relative_to(ROOT)}  ({len(enriched_questions)} questions)")
    print(f"wrote {OUT_DOUBTS.relative_to(ROOT)}    ({len(doubt_items)} doubt items: {override_count} AI overrides, {uncertain_count} needs-review)")
    if missing:
        print(f"warning: {len(missing)} questions missing enriched results: {missing[:10]}{'…' if len(missing) > 10 else ''}")


if __name__ == "__main__":
    main()
