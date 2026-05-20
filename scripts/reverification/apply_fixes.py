#!/usr/bin/env python3
"""Apply Opus + codex consensus to enriched files, quarantine the ambiguous.

Two paths driven by `finalDecision.status` in `src/data/disputed-questions.json`:

1. **Update in-place** when both AI models agree AND at least one source file
   matches them (`unanimous_agreement`, `models_agree_with_majority_sources`).
   For each disagreeing source, rewrite `correctAnswer*`, `answers[].isCorrect`,
   `answers[].why` (using Opus `bestWhys`), and `hint` (using Opus `bestHint`).

2. **Quarantine** when models disagree with each other OR with all sources
   (`models_split_on_sources`, `models_split_one_alone`,
   `models_agree_disagree_with_sources`). The full question dicts are copied to
   `src/data/imports/krok-disputed-quarantine.json` (schema v1) and removed
   from the enriched files. The quarantine file carries enough context to
   restore later.

Use `--dry-run` to preview without writing.
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
IMPORTS_DIR = REPO_ROOT / "src" / "data" / "imports"
DISPUTED_PATH = REPO_ROOT / "src" / "data" / "disputed-questions.json"
QUARANTINE_PATH = IMPORTS_DIR / "krok-disputed-quarantine.json"

UPDATE_STATUSES = {"unanimous_agreement", "models_agree_with_majority_sources"}
QUARANTINE_STATUSES = {
    "models_agree_disagree_with_sources",
    "models_split_on_sources",
    "models_split_one_alone",
}


def load_enriched(file_id: str) -> tuple[Path, dict] | None:
    """Load `<file_id>.enriched.json`; falls back to `.json` if no enriched."""
    for suffix in (".enriched.json", ".json"):
        path = IMPORTS_DIR / f"{file_id}{suffix}"
        if path.exists():
            with path.open() as f:
                return path, json.load(f)
    print(f"WARN: no source file for {file_id}")
    return None


def find_question(enriched: dict, qid: str) -> tuple[int, int, dict] | None:
    """Return (block_index, question_index, question_dict) for given qId."""
    for bi, block in enumerate(enriched.get("blocks", [])):
        for qi, q in enumerate(block.get("questions", [])):
            if q.get("id") == qid:
                return bi, qi, q
    return None


def apply_fix_to_question(
    question: dict,
    new_key: str,
    new_index: int,
    new_text: str,
    best_whys: dict | None,
    best_hint: dict | None,
    audit: dict,
) -> dict:
    """Mutate a question dict to align with new correct answer + new explanations.

    `best_whys` is a {key: {source, angle, text}} map from Opus reverification.
    `best_hint` is {source, angle, text} from Opus reverification.
    """
    q = deepcopy(question)
    prev_key = q.get("correctAnswerKey")

    q["correctAnswer"] = new_index
    q["correctAnswerKey"] = new_key
    q["correctAnswerText"] = new_text

    for a in q.get("answers", []):
        a["isCorrect"] = (a.get("key") == new_key)
        # Replace `why` from Opus bestWhys[key] when available
        if best_whys and a.get("key") in best_whys:
            bw = best_whys[a["key"]]
            if isinstance(bw, dict) and bw.get("text"):
                a["why"] = bw["text"]
                a["whyChoice"] = {
                    "selectedAngle": bw.get("angle"),
                    "reason": f"Re-selected after Opus+codex consensus (dispute fix); source={bw.get('source')}",
                }

    if best_hint and best_hint.get("text"):
        q["hint"] = best_hint["text"]
        q["hintChoice"] = {
            "selectedAngle": best_hint.get("angle"),
            "reason": f"Re-selected after Opus+codex consensus (dispute fix); source={best_hint.get('source')}",
        }

    q.setdefault("disputeHistory", []).append({
        "fixedAt": audit["timestamp"],
        "fixedBy": audit["fixedBy"],
        "previousCorrectKey": prev_key,
        "newCorrectKey": new_key,
        "uid": audit["uid"],
        "status": audit["status"],
    })

    return q


def quarantine_snapshot(question: dict, file_id: str, block_index: int, question_index: int) -> dict:
    return {
        "file": file_id,
        "qId": question.get("id"),
        "qNumber": question.get("number"),
        "originalBlockIndex": block_index,
        "originalQuestionIndex": question_index,
        "question": question,
    }


def main(dry_run: bool) -> None:
    with DISPUTED_PATH.open() as f:
        disputed = json.load(f)

    # In-memory cache of enriched files (to avoid re-loading per item)
    enriched_cache: dict[str, tuple[Path, dict]] = {}
    quarantine_items: list[dict] = []
    fix_log: list[dict] = []
    timestamp = datetime.now(timezone.utc).isoformat()

    for item in disputed["items"]:
        status = item["finalDecision"]["status"]
        suggested = item["finalDecision"].get("suggestedKey")
        uid = item["uid"]

        if status in UPDATE_STATUSES:
            if not suggested:
                print(f"SKIP {uid}: no suggestedKey")
                continue

            best_whys = (item.get("reverification") or {}).get("bestWhys")
            best_hint = (item.get("reverification") or {}).get("bestHint")
            consensus_voters = item["finalDecision"].get("candidateBreakdown", {}).get(suggested, {}).get("voters", [])

            # Collect every plausible consensus answer text. Different sources
            # may phrase the same answer differently (file-2: "ковзної поверхні"
            # vs file-3: "ковзної дошки"). We'll try each candidate when
            # locating the answer in a disagreeing source's options.
            consensus_texts: list[str] = []
            for src in item["sources"]:
                if (src.get("correctAnswerKey") or "").lower() == suggested:
                    idx = "abcde".index(suggested)
                    if idx < len(src.get("options", [])):
                        consensus_texts.append(src["options"][idx])
            for verdict in (
                (item.get("reverification") or {}).get("finalAnswer"),
                (item.get("userChatGptVerification") or {}).get("finalAnswer"),
            ):
                t = (verdict or {}).get("text")
                if t and t not in consensus_texts:
                    consensus_texts.append(t)

            for src in item["sources"]:
                file_id = src["file"]
                if not src.get("enriched"):
                    continue

                if file_id not in enriched_cache:
                    loaded = load_enriched(file_id)
                    if not loaded:
                        continue
                    enriched_cache[file_id] = loaded
                path, enriched = enriched_cache[file_id]

                found = find_question(enriched, src["qId"])
                if not found:
                    print(f"WARN: {src['qId']} not in {path.name}")
                    continue
                bi, qi, q = found

                # Locate the consensus answer in THIS source's options by text.
                # Try each consensus candidate; exact match first, normalized
                # Cyr/Lat homoglyph match second.
                from dedupe_questions import normalize_text
                opts = q.get("options", [])
                new_index = None
                for candidate in consensus_texts:
                    for i, o in enumerate(opts):
                        if o == candidate:
                            new_index = i
                            break
                    if new_index is not None:
                        break
                    target = normalize_text(candidate)
                    for i, o in enumerate(opts):
                        if normalize_text(o) == target:
                            new_index = i
                            break
                    if new_index is not None:
                        break

                if new_index is None:
                    print(f"WARN: {src['qId']} consensus text not found in options — skipping (option drift; texts tried: {consensus_texts})")
                    continue

                new_key = "abcde"[new_index]
                new_text = opts[new_index]

                # Already correct? skip
                if (src.get("correctAnswerKey") or "").lower() == new_key:
                    continue

                fixed_q = apply_fix_to_question(
                    q, new_key, new_index, new_text, best_whys, best_hint,
                    {"timestamp": timestamp, "fixedBy": consensus_voters, "uid": uid, "status": status},
                )
                enriched["blocks"][bi]["questions"][qi] = fixed_q
                fix_log.append({
                    "uid": uid,
                    "file": file_id,
                    "qId": src["qId"],
                    "previousKey": src.get("correctAnswerKey"),
                    "newKey": new_key,
                    "status": status,
                })

        elif status in QUARANTINE_STATUSES:
            snapshots = []
            for src in item["sources"]:
                file_id = src["file"]
                if not src.get("enriched"):
                    continue
                if file_id not in enriched_cache:
                    loaded = load_enriched(file_id)
                    if not loaded:
                        continue
                    enriched_cache[file_id] = loaded
                path, enriched = enriched_cache[file_id]

                found = find_question(enriched, src["qId"])
                if not found:
                    print(f"WARN: {src['qId']} not in {path.name} (already removed?)")
                    continue
                bi, qi, q = found
                snapshots.append(quarantine_snapshot(q, file_id, bi, qi))
                # Remove from enriched (deferred — defer until all snapshots taken
                # so indices stay stable; mark for deletion)

            # Deletion pass — by qId so indices don't shift mid-loop
            qids_to_remove = {snap["qId"] for snap in snapshots}
            for snap in snapshots:
                fid = snap["file"]
                _path, enriched = enriched_cache[fid]
                for block in enriched.get("blocks", []):
                    block["questions"] = [
                        q for q in block.get("questions", []) if q.get("id") not in qids_to_remove
                    ]
                    block["questionCount"] = len(block["questions"])
                # Top-level sourceBlock count
                sb = enriched.get("sourceBlock") or {}
                if "questionCount" in sb:
                    total = sum(len(b.get("questions", [])) for b in enriched.get("blocks", []))
                    sb["questionCount"] = total

            quarantine_items.append({
                "uid": uid,
                "status": status,
                "reasons": item.get("reasons", []),
                "quarantinedAt": timestamp,
                "modelVotes": {
                    "opus-4.7": ((item.get("reverification") or {}).get("finalAnswer") or {}).get("key"),
                    "codex-gpt-5.5": ((item.get("userChatGptVerification") or {}).get("finalAnswer") or {}).get("key"),
                },
                "modelConfidence": {
                    "opus-4.7": ((item.get("reverification") or {}).get("finalAnswer") or {}).get("confidence"),
                    "codex-gpt-5.5": ((item.get("userChatGptVerification") or {}).get("finalAnswer") or {}).get("confidence"),
                },
                "candidateBreakdown": item["finalDecision"].get("candidateBreakdown"),
                "removedFrom": [
                    {"file": s["file"], "qId": s["qId"], "qNumber": s["qNumber"],
                     "originalBlockIndex": s["originalBlockIndex"],
                     "originalQuestionIndex": s["originalQuestionIndex"]}
                    for s in snapshots
                ],
                "questionsSnapshot": {s["file"]: s["question"] for s in snapshots},
                "manualReviewNotes": None,
            })

    quarantine_payload = {
        "schemaVersion": "krok-quarantine.v1",
        "generatedAt": timestamp,
        "summary": {
            "totalQuarantined": len(quarantine_items),
            "byStatus": _count_by(quarantine_items, "status"),
            "filesAffected": sorted({s["file"] for it in quarantine_items for s in it["removedFrom"]}),
        },
        "items": quarantine_items,
        "restoreInstructions": (
            "To restore a quarantined item: copy `questionsSnapshot[<file>]` back into the corresponding "
            "block's `questions[]` array (at `originalQuestionIndex` if order matters), then increment "
            "`questionCount`. Or run a future `restore_from_quarantine.py` helper."
        ),
    }

    # Write everything
    if dry_run:
        print(f"\n=== DRY RUN — would modify {len(enriched_cache)} files, fix {len(fix_log)} answers, quarantine {len(quarantine_items)} items ===")
        for log in fix_log:
            print(f"  FIX  {log['file']} {log['qId']}: {log['previousKey']} → {log['newKey']}  ({log['status']})")
        for it in quarantine_items:
            files = ", ".join(s["file"] for s in it["removedFrom"])
            print(f"  Q&A  {it['uid']}  removed from {files}  ({it['status']})")
        return

    # Write quarantine
    QUARANTINE_PATH.write_text(json.dumps(quarantine_payload, ensure_ascii=False, indent=2))
    print(f"Wrote {QUARANTINE_PATH} ({len(quarantine_items)} items)")

    # Write modified enriched files
    for file_id, (path, enriched) in enriched_cache.items():
        path.write_text(json.dumps(enriched, ensure_ascii=False, indent=2))
        print(f"Updated {path.name}")

    print(f"\nFixes applied: {len(fix_log)}")
    print(f"Quarantined: {len(quarantine_items)}")


def _count_by(items: list[dict], key: str) -> dict:
    out: dict = {}
    for it in items:
        out[it[key]] = out.get(it[key], 0) + 1
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
