#!/usr/bin/env python3
"""Cross-file duplicate detection across enriched Krok question files.

Auto-discovers every `src/data/imports/krok-file-N(.enriched).json`, groups
questions by normalized question text, and writes `cross-file-duplicates.json`
listing every group where the same question appears in 2+ files (consensus or
mismatch). Adding a new `krok-file-N.enriched.json` requires no code change.
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
IMPORTS_DIR = REPO_ROOT / "src" / "data" / "imports"
OUTPUT_PATH = Path(__file__).resolve().parent / "cross-file-duplicates.json"


def discover_source_files():
    """Return [(file_id, [candidate_filename, ...]), ...] sorted by file number.

    Picks up any `krok-file-<N>.json` in IMPORTS_DIR. Each entry's candidate
    list prefers `.enriched.json`, falls back to raw `.json`. Files that have
    only enriched OR only raw still produce a single-candidate entry.
    """
    # Only pick up question banks: `krok-file-<digits>(.enriched).json`.
    # Excludes `*-doubts.json`, `krok-disputed-quarantine.json`, etc.
    pattern = re.compile(r"^(krok-file-\d+)(?:\.enriched)?\.json$")
    file_ids = set()
    for path in IMPORTS_DIR.iterdir():
        m = pattern.match(path.name)
        if m:
            file_ids.add(m.group(1))

    out = []
    for fid in sorted(file_ids, key=lambda f: int(f.rsplit("-", 1)[1])):
        candidates = [f"{fid}.enriched.json", f"{fid}.json"]
        candidates = [c for c in candidates if (IMPORTS_DIR / c).exists()]
        if candidates:
            out.append((fid, candidates))
    return out


SOURCE_FILES = discover_source_files()

# Cyrillic→Latin homoglyph fold for lookalike characters that appear interchangeably
# in OCR'd Krok text (e.g. "С7" with Cyrillic С vs "C7" with Latin C — visually identical).
CYR_TO_LAT = str.maketrans({
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H",
    "О": "O", "Р": "P", "С": "C", "Т": "T", "У": "Y", "Х": "X",
    "а": "a", "в": "b", "е": "e", "к": "k", "м": "m", "о": "o",
    "р": "p", "с": "c", "т": "t", "у": "y", "х": "x",
})


def normalize_text(text: str) -> str:
    """Aggressive normalization for fuzzy match: lowercase, NFKD, strip punct/whitespace.

    Also fixes PDF wrap artifacts like 'хребетно- спинномозкової' (a hyphen
    immediately followed by whitespace is a line break the extractor preserved)
    and folds Cyrillic-Latin homoglyphs.
    """
    if not text:
        return ""
    s = unicodedata.normalize("NFKD", text)
    s = s.translate(CYR_TO_LAT).lower()
    # Fix hyphenated PDF line wraps: "хребетно- спинномозкової" -> "хребетноспинномозкової"
    s = re.sub(r"-\s+", "", s)
    # Drop all non-letter/digit characters (keeps cyrillic + latin + digits)
    s = re.sub(r"[^\w]+", "", s, flags=re.UNICODE)
    return s


def load_questions():
    """Yield (file_id, is_enriched, question_dict) for every question across all sources."""
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
            print(f"WARN: no source found for {file_id} (tried {candidates})")
            continue
        with path.open() as f:
            data = json.load(f)
        for block in data.get("blocks", []):
            for q in block.get("questions", []):
                yield file_id, is_enriched, q


def options_signature(options: list[str]) -> str:
    """Order-insensitive signature of option texts (normalized + sorted)."""
    norms = sorted(normalize_text(o) for o in options)
    return "||".join(norms)


def build_groups():
    groups: dict[str, list[dict]] = {}
    for file_id, is_enriched, q in load_questions():
        key = normalize_text(q.get("question", ""))
        entry = {
            "file": file_id,
            "enriched": is_enriched,
            "qId": q.get("id"),
            "qNumber": q.get("number"),
            "questionRaw": q.get("question"),
            "options": q.get("options", []),
            "optionsSignature": options_signature(q.get("options", [])),
            "correctAnswerKey": q.get("correctAnswerKey"),
            "correctAnswerText": q.get("correctAnswerText"),
            "correctAnswer": q.get("correctAnswer"),
            "validation": q.get("validation", {}),
        }
        groups.setdefault(key, []).append(entry)
    return groups


def classify(group: list[dict]) -> tuple[str, bool]:
    """Return (status, option_drift) for a group of size >=2."""
    answer_norms = {normalize_text(e.get("correctAnswerText") or "") for e in group}
    status = "consensus" if len(answer_norms) == 1 else "mismatch"
    option_drift = len({e["optionsSignature"] for e in group}) > 1
    return status, option_drift


def main() -> None:
    groups = build_groups()
    dup_groups = []
    consensus_count = 0
    mismatch_count = 0
    for key, entries in groups.items():
        if len(entries) < 2:
            continue
        status, opt_drift = classify(entries)
        if status == "consensus":
            consensus_count += 1
        else:
            mismatch_count += 1
        dup_groups.append({
            "questionNormalized": key[:120] + ("..." if len(key) > 120 else ""),
            "questionRaw": entries[0]["questionRaw"],
            "status": status,
            "optionDrift": opt_drift,
            "sources": [
                {
                    "file": e["file"],
                    "qId": e["qId"],
                    "qNumber": e["qNumber"],
                    "correctAnswerKey": e["correctAnswerKey"],
                    "correctAnswerText": e["correctAnswerText"],
                    "correctAnswer": e["correctAnswer"],
                    "confidence": (e["validation"] or {}).get("confidence"),
                    "clinicalAgreement": (e["validation"] or {}).get("clinicalAgreement"),
                    "needsReview": (e["validation"] or {}).get("needsReview"),
                } for e in entries
            ],
        })

    # Stable sort: mismatches first, then by question number of first source
    dup_groups.sort(key=lambda g: (
        0 if g["status"] == "mismatch" else 1,
        g["sources"][0].get("qNumber") or 0,
    ))

    payload = {
        "schemaVersion": "krok-cross-file-duplicates.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "totalGroups": len(dup_groups),
            "consensusGroups": consensus_count,
            "mismatchGroups": mismatch_count,
        },
        "groups": dup_groups,
    }

    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"Wrote {OUTPUT_PATH}")
    print(f"  totalGroups={len(dup_groups)} consensus={consensus_count} mismatch={mismatch_count}")


if __name__ == "__main__":
    main()
