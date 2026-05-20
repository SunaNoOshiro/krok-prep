#!/usr/bin/env python3
"""Split `needs-reverification.json` into per-uid batch files for run.sh."""

from __future__ import annotations

import json
from pathlib import Path

REVERIFY_DIR = Path(__file__).resolve().parent
INPUT = REVERIFY_DIR / "needs-reverification.json"
BATCHES_DIR = REVERIFY_DIR / "batches"


def main() -> None:
    BATCHES_DIR.mkdir(exist_ok=True)
    with INPUT.open() as f:
        payload = json.load(f)
    for item in payload["items"]:
        uid = item["uid"]
        out = BATCHES_DIR / f"{uid}.json"
        out.write_text(json.dumps(item, ensure_ascii=False, indent=2))
    print(f"Wrote {len(payload['items'])} batches to {BATCHES_DIR}")


if __name__ == "__main__":
    main()
