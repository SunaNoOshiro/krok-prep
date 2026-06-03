#!/usr/bin/env python3
"""Collect all questions that need re-verification.

A question is "uncertain" if ANY of:
  - validation.confidence ∈ {medium, low}
  - validation.clinicalAgreement ∈ {disagree, uncertain}
  - validation.needsReview == true
  - it is part of a cross-file `mismatch` group (from dedupe_questions.py)

Output (`needs-reverification.json`) is a flat list of items keyed by the
normalized question text — so the same question appearing in 2 files is merged
into ONE item with multiple `sources[]`, avoiding duplicate Opus 4.8 calls.

Each item carries the full enrichment payload (answers, whyCandidates,
hintCandidates, validation) from every source so the Opus 4.8 prompt has access
to all explanation candidates for best-of selection.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from dedupe_questions import (
    IMPORTS_DIR,
    SOURCE_FILES,
    normalize_text,
)

REVERIFY_DIR = Path(__file__).resolve().parent
DUP_PATH = REVERIFY_DIR / "cross-file-duplicates.json"
OUTPUT_PATH = REVERIFY_DIR / "needs-reverification.json"


def load_all_questions():
    """Return list of (file_id, is_enriched, source_path, q_dict)."""
    out = []
    for file_id, candidates in SOURCE_FILES:
        path = None
        is_enriched = False
        for fname in candidates:
            candidate = IMPORTS_DIR / fname
            if candidate.exists():
                path = candidate
                is_enriched = fname.endswith(".enriched.json")
                break
        if path is None:
            continue
        with path.open() as f:
            data = json.load(f)
        for block in data.get("blocks", []):
            for q in block.get("questions", []):
                out.append((file_id, is_enriched, str(path.name), q))
    return out


def reasons_for(q: dict) -> list[str]:
    v = q.get("validation") or {}
    reasons = []
    conf = v.get("confidence")
    if conf in ("medium", "low"):
        reasons.append(f"{conf}_confidence")
    if v.get("clinicalAgreement") == "disagree":
        reasons.append("ai_disagrees_pdf")
    elif v.get("clinicalAgreement") == "uncertain":
        reasons.append("ai_uncertain")
    if v.get("needsReview") is True:
        reasons.append("needs_review_flag")
    return reasons


def source_payload(file_id: str, is_enriched: bool, source_file: str, q: dict) -> dict:
    """Shape the per-source record. Keep heavy fields (whyCandidates) only for enriched."""
    payload = {
        "file": file_id,
        "sourceFile": source_file,
        "enriched": is_enriched,
        "qId": q.get("id"),
        "qNumber": q.get("number"),
        "question": q.get("question"),
        "options": q.get("options", []),
        "correctAnswer": q.get("correctAnswer"),
        "correctAnswerKey": q.get("correctAnswerKey"),
        "correctAnswerText": q.get("correctAnswerText"),
    }
    if is_enriched:
        payload.update({
            "answers": q.get("answers", []),
            "hintCandidates": q.get("hintCandidates", []),
            "hintChoice": q.get("hintChoice"),
            "hint": q.get("hint"),
            "validation": q.get("validation", {}),
            "topic": q.get("topic"),
            "clinicalTopic": q.get("clinicalTopic"),
            "enrichedBy": q.get("enrichedBy"),
        })
    return payload


def main() -> None:
    with DUP_PATH.open() as f:
        dups = json.load(f)
    mismatch_norm_keys = {
        normalize_text(g["questionRaw"])
        for g in dups["groups"]
        if g["status"] == "mismatch"
    }

    all_q = load_all_questions()
    # Group every question by normalized text (mirror dedupe_questions.py logic)
    by_norm: dict[str, list[tuple]] = {}
    for entry in all_q:
        file_id, is_enriched, source_file, q = entry
        norm = normalize_text(q.get("question", ""))
        by_norm.setdefault(norm, []).append(entry)

    items: list[dict] = []
    counts = {"cross_file_mismatch": 0, "medium_confidence": 0, "low_confidence": 0,
              "ai_disagrees_pdf": 0, "ai_uncertain": 0, "needs_review_flag": 0}

    for norm, group in by_norm.items():
        # Collect per-question reasons across all sources of this group
        union_reasons: set[str] = set()
        if norm in mismatch_norm_keys:
            union_reasons.add("cross_file_mismatch")
        for file_id, is_enriched, _src, q in group:
            for r in reasons_for(q):
                union_reasons.add(r)

        if not union_reasons:
            continue

        # synthetic uid: prefer qId of first enriched source, else first source
        enriched_first = next((g for g in group if g[1]), None)
        uid_source = enriched_first if enriched_first else group[0]
        uid_qid = uid_source[3].get("id")
        if "cross_file_mismatch" in union_reasons and len({g[0] for g in group}) > 1:
            uid = f"dup-{uid_source[3].get('number'):03d}-{uid_source[3].get('number'):03d}"
            # If only one number is involved (typical for same-qNumber match), use it directly
            numbers = sorted({g[3].get("number") for g in group if g[3].get("number") is not None})
            if numbers:
                uid = f"dup-q{numbers[0]:03d}"
        else:
            uid = uid_qid

        for r in union_reasons:
            counts[r] = counts.get(r, 0) + 1

        items.append({
            "uid": uid,
            "questionNormalized": norm[:100] + ("..." if len(norm) > 100 else ""),
            "reasons": sorted(union_reasons),
            "sources": [source_payload(fid, enr, src, q) for fid, enr, src, q in group],
        })

    # Sort: cross_file_mismatches first, then by uid for stable order
    items.sort(key=lambda x: (
        0 if "cross_file_mismatch" in x["reasons"] else 1,
        x["uid"],
    ))

    payload = {
        "schemaVersion": "krok-needs-reverification.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "totalItems": len(items),
            "byReason": counts,
        },
        "items": items,
    }

    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"Wrote {OUTPUT_PATH}")
    print(f"  totalItems={len(items)}")
    print(f"  byReason={counts}")


if __name__ == "__main__":
    main()
