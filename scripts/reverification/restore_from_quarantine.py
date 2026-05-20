#!/usr/bin/env python3
"""Move a quarantined question back into its enriched.json source file(s).

Usage:
  python3 restore_from_quarantine.py <uid>            # restore one item by uid
  python3 restore_from_quarantine.py --list           # list quarantined uids
  python3 restore_from_quarantine.py --all            # restore everything

Restores include ALL source copies of the question (e.g. a dup item with 2
sources will be re-inserted into both files). After successful restore the
item is removed from the quarantine file.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
IMPORTS_DIR = REPO_ROOT / "src" / "data" / "imports"
QUARANTINE_PATH = IMPORTS_DIR / "krok-disputed-quarantine.json"


def load_enriched(file_id: str) -> tuple[Path, dict]:
    path = IMPORTS_DIR / f"{file_id}.enriched.json"
    if not path.exists():
        path = IMPORTS_DIR / f"{file_id}.json"
    with path.open() as f:
        return path, json.load(f)


def restore_item(item: dict) -> bool:
    """Insert each source-copy of the question back into its enriched file at
    the recorded original index (or at end if index is now out of range)."""
    success = True
    for src in item["removedFrom"]:
        file_id = src["file"]
        qid = src["qId"]
        bi = src["originalBlockIndex"]
        qi = src["originalQuestionIndex"]
        path, enriched = load_enriched(file_id)

        # Make sure block index is valid
        blocks = enriched.get("blocks", [])
        if bi >= len(blocks):
            print(f"ERROR: block index {bi} out of range in {path.name}")
            success = False
            continue
        questions = blocks[bi].setdefault("questions", [])

        # Skip if already present
        if any(q.get("id") == qid for q in questions):
            print(f"SKIP: {qid} already present in {path.name}")
            continue

        snapshot = item["questionsSnapshot"].get(file_id)
        if not snapshot:
            print(f"ERROR: no snapshot for {file_id} in quarantine item {item['uid']}")
            success = False
            continue

        # Strip the disputeHistory entry that may have been added pre-quarantine;
        # the question is going back to "needs review" state.
        snapshot.pop("quarantineHistory", None)

        # Insert at original position (or append if past end)
        insert_at = min(qi, len(questions))
        questions.insert(insert_at, snapshot)
        blocks[bi]["questionCount"] = len(questions)

        # Update top-level count
        sb = enriched.get("sourceBlock") or {}
        if "questionCount" in sb:
            sb["questionCount"] = sum(len(b.get("questions", [])) for b in blocks)

        path.write_text(json.dumps(enriched, ensure_ascii=False, indent=2))
        print(f"Restored {qid} → {path.name} at position {insert_at}")
    return success


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("uid", nargs="?", help="UID to restore")
    parser.add_argument("--list", action="store_true", help="List quarantined uids")
    parser.add_argument("--all", action="store_true", help="Restore everything")
    args = parser.parse_args()

    with QUARANTINE_PATH.open() as f:
        payload = json.load(f)

    if args.list:
        for it in payload["items"]:
            files = ",".join(s["file"] for s in it["removedFrom"])
            print(f"{it['uid']}  [{it['status']}]  → {files}")
        return

    targets: list[dict] = []
    if args.all:
        targets = list(payload["items"])
    elif args.uid:
        targets = [it for it in payload["items"] if it["uid"] == args.uid]
        if not targets:
            print(f"No quarantined item with uid={args.uid}", file=sys.stderr)
            sys.exit(1)
    else:
        parser.print_help()
        sys.exit(1)

    restored_uids: set[str] = set()
    for item in targets:
        if restore_item(item):
            restored_uids.add(item["uid"])

    # Rewrite quarantine without the restored items
    payload["items"] = [it for it in payload["items"] if it["uid"] not in restored_uids]
    payload["summary"]["totalQuarantined"] = len(payload["items"])
    QUARANTINE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"\nRestored: {len(restored_uids)} items. Quarantine remaining: {len(payload['items'])}.")


if __name__ == "__main__":
    main()
