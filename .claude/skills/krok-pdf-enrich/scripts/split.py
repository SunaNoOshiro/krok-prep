#!/usr/bin/env python3
"""Split a krok block JSON into one file per question.

Usage:
  cd .tmp_rewrite/<BLOCK_ID>_enrich
  python3 split.py <BLOCK_ID>            # reads ../../src/data/imports/<BLOCK_ID>.json
  python3 split.py <BLOCK_ID> <src.json> # explicit source path

Writes batches/q###.json (3-digit padded, based on the question's `number` field).
"""
import json
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: split.py <BLOCK_ID> [<src-json-path>]")
    block_id = sys.argv[1]
    here = Path.cwd()
    if len(sys.argv) >= 3:
        src = Path(sys.argv[2]).resolve()
    else:
        # default: ../../src/data/imports/<BLOCK_ID>.json (from .tmp_rewrite/<X>_enrich/)
        src = (here.parent.parent / "src/data/imports" / f"{block_id}.json").resolve()
    if not src.exists():
        sys.exit(f"source not found: {src}")

    out = here / "batches"
    out.mkdir(exist_ok=True)

    data = json.loads(src.read_text())
    questions = data["blocks"][0]["questions"]

    for q in questions:
        n = q["number"]
        (out / f"q{n:03d}.json").write_text(json.dumps(q, ensure_ascii=False, indent=2))

    print(f"split {len(questions)} questions from {src}")
    print(f"  -> {out}")


if __name__ == "__main__":
    main()
