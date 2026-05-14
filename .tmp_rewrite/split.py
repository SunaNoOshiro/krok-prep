#!/usr/bin/env python3
"""Split each source JSON into per-question batch files (BATCH_SIZE Qs/batch).

Each batch is self-contained: it knows its source name, indices, and the
list of question objects to rewrite.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BATCHES = ROOT / "batches"
BATCHES.mkdir(exist_ok=True)
DATA = ROOT.parent / "src" / "data"

BATCH_SIZE = 15


def write_batch(name: str, idx: int, items, source_key: str):
    out = BATCHES / f"{name}_batch_{idx:03d}.json"
    out.write_text(
        json.dumps(
            {"name": name, "batch": idx, "sourceKey": source_key, "questions": items},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return out


def split_flat(json_path: Path, name: str):
    data = json.loads(json_path.read_text(encoding="utf-8"))
    paths = []
    for i in range(0, len(data), BATCH_SIZE):
        chunk = data[i : i + BATCH_SIZE]
        paths.append(write_batch(name, i // BATCH_SIZE, chunk, name))
    return paths


def split_blocks(json_path: Path, name: str):
    data = json.loads(json_path.read_text(encoding="utf-8"))
    qs = data["blocks"][0]["questions"]
    paths = []
    for i in range(0, len(qs), BATCH_SIZE):
        chunk = qs[i : i + BATCH_SIZE]
        paths.append(write_batch(name, i // BATCH_SIZE, chunk, name))
    return paths


if __name__ == "__main__":
    paths = []
    paths += split_blocks(DATA / "imports" / "krok-file-8.json", "krok-file-8")
    paths += split_flat(DATA / "edkiData.json", "edkiData")
    paths += split_flat(DATA / "quizData.json", "quizData")
    paths += split_flat(DATA / "selfControlData.json", "selfControlData")
    for p in paths:
        print(p)
    print(f"\nTotal batches: {len(paths)}")
