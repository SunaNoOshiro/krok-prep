#!/usr/bin/env python3
"""Split flagged hints into rewrite batches."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FLAGGED_FILE = ROOT / "flagged.json"
BATCHES_DIR = ROOT / "hint_rewrite_batches"

BATCH_SIZE = 20

def split_into_batches():
    """Split flagged hints into rewrite batches."""
    BATCHES_DIR.mkdir(exist_ok=True)

    if not FLAGGED_FILE.exists():
        print(f"ERROR: {FLAGGED_FILE} not found")
        exit(1)

    flagged = json.loads(FLAGGED_FILE.read_text(encoding="utf-8"))
    flagged_items = [f for f in flagged if f.get("status") in ["weak", "broken"]]
    print(f"Total flagged hints: {len(flagged_items)} (from {len(flagged)} items)")

    if len(flagged_items) == 0:
        print("No flagged hints to rewrite!")
        return

    batch_num = 0
    for i in range(0, len(flagged_items), BATCH_SIZE):
        batch = flagged_items[i:i+BATCH_SIZE]
        batch_data = {
            "batch_num": batch_num,
            "total_in_batch": len(batch),
            "rewrites": batch
        }
        batch_file = BATCHES_DIR / f"rewrite_batch_{batch_num:03d}.json"
        batch_file.write_text(
            json.dumps(batch_data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        batch_num += 1

    print(f"Created {batch_num} rewrite batches (size={BATCH_SIZE})")

if __name__ == "__main__":
    split_into_batches()
