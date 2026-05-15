#!/usr/bin/env python3
"""Split all-variants into best-of selection batches."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VARIANTS_FILE = ROOT / "all_variants.json"
BATCHES_DIR = ROOT / "hint_best_of_batches"

BATCH_SIZE = 10  # Smaller because each item has multiple variants

if __name__ == "__main__":
    variants = json.loads(VARIANTS_FILE.read_text(encoding="utf-8"))
    BATCHES_DIR.mkdir(exist_ok=True)

    print(f"Total hints needing selection: {len(variants)}")

    batch_num = 0
    for i in range(0, len(variants), BATCH_SIZE):
        batch = variants[i:i+BATCH_SIZE]
        batch_data = {
            "batch_num": batch_num,
            "total_in_batch": len(batch),
            "selections": batch
        }
        (BATCHES_DIR / f"best_of_batch_{batch_num:03d}.json").write_text(
            json.dumps(batch_data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        batch_num += 1

    print(f"Created {batch_num} batches")
