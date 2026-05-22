#!/usr/bin/env python3
"""Build the final consolidated disputed-questions.json.

For every item in `needs-reverification.json`, combine:
  - original per-file source records (correctAnswerKey, why, hint, validation)
  - the Opus 4.7 max re-verification result from `results/<uid>.json` (if present)
  - a placeholder `userChatGptVerification: null` field for the user to fill in
    after running the matching `chatgpt-prompts/<uid>.md` prompt

Then write to `src/data/disputed-questions.json` with summary stats. The script
works even before run_opus.sh has executed — uncomputed items will have
`reverification: null`.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

REVERIFY_DIR = Path(__file__).resolve().parent
REPO_ROOT = REVERIFY_DIR.parents[1]

INPUT = REVERIFY_DIR / "needs-reverification.json"
RESULTS_DIR = REVERIFY_DIR / "results"
CHATGPT_RESPONSES_DIR = REVERIFY_DIR / "chatgpt-prompts" / "responses"
OUTPUT = REPO_ROOT / "src" / "data" / "disputed-questions.json"


def load_reverification(uid: str) -> dict | None:
    path = RESULTS_DIR / f"{uid}.json"
    if not path.exists() or path.stat().st_size == 0:
        return None
    try:
        with path.open() as f:
            return json.load(f)
    except json.JSONDecodeError:
        return None


def load_chatgpt_response(uid: str) -> dict | None:
    """Read user-pasted ChatGPT response, returning None if the stub is unfilled.

    A stub is "unfilled" if every value-bearing field (`independentChoice`,
    `finalAnswer`, `crossCheck`) is still null — i.e. the user hasn't
    pasted anything yet. Malformed JSON returns None and surfaces a warning.
    """
    path = CHATGPT_RESPONSES_DIR / f"{uid}.json"
    if not path.exists() or path.stat().st_size == 0:
        return None
    try:
        with path.open() as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"WARN: malformed JSON in {path}: {e}")
        return None
    if not any(data.get(k) for k in ("independentChoice", "finalAnswer", "crossCheck")):
        return None
    return data


def source_brief(s: dict) -> dict:
    """Project a per-source record down to fields used by downstream review."""
    v = s.get("validation") or {}
    return {
        "file": s["file"],
        "qId": s.get("qId"),
        "qNumber": s.get("qNumber"),
        "enriched": s.get("enriched", False),
        "options": s.get("options", []),
        "correctAnswer": s.get("correctAnswer"),
        "correctAnswerKey": s.get("correctAnswerKey"),
        "correctAnswerText": s.get("correctAnswerText"),
        "hint": s.get("hint"),
        "validation": {
            "clinicalAgreement": v.get("clinicalAgreement"),
            "confidence": v.get("confidence"),
            "modelChosenKey": v.get("modelChosenKey"),
            "modelChosenText": v.get("modelChosenText"),
            "needsReview": v.get("needsReview"),
            "reasoning": v.get("reasoning"),
        } if s.get("enriched") else None,
        "answersWhy": [
            {"key": a.get("key"), "text": a.get("text"), "isCorrect": a.get("isCorrect"), "why": a.get("why")}
            for a in s.get("answers", [])
        ] if s.get("enriched") else None,
    }


def compute_final_decision(item_sources: list[dict], reverification: dict | None, chatgpt: dict | None) -> dict:
    """Derive suggestedKey + status from sources + Opus verdict + codex/ChatGPT verdict.

    Voting members:
      - each source file (with its `correctAnswerKey`)
      - Opus 4.7 re-verification (`reverification.finalAnswer.key`)
      - codex/ChatGPT verification (`chatgpt.finalAnswer.key`)

    Status:
      - `awaiting_reverification` — neither Opus nor codex has run
      - `unanimous_agreement` — every vote (sources + Opus + codex) is the same key
      - `models_agree_with_majority_sources` — Opus + codex agree, and at least one source agrees too
      - `models_agree_disagree_with_sources` — Opus + codex agree, but contradict ALL sources
      - `models_split_on_sources` — Opus + codex pick different keys, each backed by ≥1 source
      - `models_split_one_alone` — Opus + codex pick different keys, only one is backed by sources
      - `single_model_only` — only one of (Opus, codex) ran
    """
    if reverification is None and chatgpt is None:
        return {
            "status": "awaiting_reverification",
            "suggestedKey": None,
            "summary": "Жодна модель ще не запускалась",
        }

    def _key(verdict: dict | None) -> str | None:
        if not verdict:
            return None
        k = (verdict.get("finalAnswer") or {}).get("key")
        return k.lower() if k else None

    opus_key = _key(reverification)
    codex_key = _key(chatgpt)
    opus_conf = (reverification or {}).get("finalAnswer", {}).get("confidence") if reverification else None
    codex_conf = (chatgpt or {}).get("finalAnswer", {}).get("confidence") if chatgpt else None

    source_keys = [(s["file"], (s.get("correctAnswerKey") or "").lower() or None) for s in item_sources]
    source_keys = [(f, k) for f, k in source_keys if k]

    def _files_with(key: str) -> list[str]:
        return [f for f, k in source_keys if k == key]

    # Compute suggested key by weighted vote (Opus + codex both count;
    # source confidence is folded in by counting source-files-matching each option)
    candidates: dict[str, dict] = {}

    def _bump(key: str, voter: str, weight: int = 1) -> None:
        if not key:
            return
        c = candidates.setdefault(key, {"voters": [], "weight": 0})
        c["voters"].append(voter)
        c["weight"] += weight

    if opus_key:
        _bump(opus_key, f"opus-4.7({opus_conf})")
    if codex_key:
        _bump(codex_key, f"codex-gpt-5.5({codex_conf})")
    for f, k in source_keys:
        _bump(k, f)

    suggested_key = max(candidates.items(), key=lambda kv: kv[1]["weight"])[0] if candidates else None

    # Categorize
    if reverification is None or chatgpt is None:
        status = "single_model_only"
    elif opus_key == codex_key:
        agreeing_sources = _files_with(opus_key)
        disagreeing_sources = [f for f, k in source_keys if k != opus_key]
        if not disagreeing_sources and agreeing_sources:
            status = "unanimous_agreement"
        elif agreeing_sources:
            status = "models_agree_with_majority_sources"
        else:
            status = "models_agree_disagree_with_sources"
    else:
        opus_backers = _files_with(opus_key) if opus_key else []
        codex_backers = _files_with(codex_key) if codex_key else []
        if opus_backers and codex_backers:
            status = "models_split_on_sources"
        else:
            status = "models_split_one_alone"

    return {
        "status": status,
        "suggestedKey": suggested_key,
        "opusKey": opus_key,
        "codexKey": codex_key,
        "opusConfidence": opus_conf,
        "codexConfidence": codex_conf,
        "candidateBreakdown": candidates,
    }


def build_item(item: dict) -> dict:
    uid = item["uid"]
    reverification = load_reverification(uid)
    chatgpt = load_chatgpt_response(uid)
    canonical = next((s for s in item["sources"] if s.get("enriched")), item["sources"][0])

    return {
        "uid": uid,
        "question": canonical["question"],
        "options": canonical["options"],
        "reasons": item["reasons"],
        "sources": [source_brief(s) for s in item["sources"]],
        "reverification": reverification,
        "userChatGptVerification": chatgpt,
        "finalDecision": compute_final_decision(item["sources"], reverification, chatgpt),
    }


def main() -> None:
    with INPUT.open() as f:
        payload = json.load(f)

    items = [build_item(it) for it in payload["items"]]

    status_counts: dict[str, int] = {}
    chatgpt_filled = 0
    for it in items:
        st = it["finalDecision"]["status"]
        status_counts[st] = status_counts.get(st, 0) + 1
        if it["userChatGptVerification"] is not None:
            chatgpt_filled += 1

    out_payload = {
        "schemaVersion": "krok-disputed.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "totalDisputed": len(items),
            "chatgptResponsesFilled": chatgpt_filled,
            "byReason": payload["summary"]["byReason"],
            "byStatus": status_counts,
        },
        "items": items,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(out_payload, ensure_ascii=False, indent=2))
    print(f"Wrote {OUTPUT}")
    print(f"  totalDisputed={len(items)}")
    print(f"  byStatus={status_counts}")


if __name__ == "__main__":
    main()
