#!/usr/bin/env python3
"""Split krok-file-1.json into one JSON file per question (batches/q###.json)."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent.parent / "src/data/imports/krok-file-1.json"
OUT = HERE / "batches"
OUT.mkdir(exist_ok=True)

data = json.loads(SRC.read_text())
questions = data["blocks"][0]["questions"]

for q in questions:
    n = q["number"]
    (OUT / f"q{n:03d}.json").write_text(
        json.dumps(q, ensure_ascii=False, indent=2)
    )

print(f"wrote {len(questions)} batches to {OUT}")
