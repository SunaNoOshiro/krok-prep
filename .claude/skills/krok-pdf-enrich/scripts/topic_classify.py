#!/usr/bin/env python3
"""Stage 9: classify `topic` + `clinicalTopic` on every question in
`src/data/imports/<BLOCK_ID>.enriched.json` via one Opus 4.7 call.

Taxonomy is auto-discovered: the script scans every other
`src/data/imports/krok-file-N(.enriched).json` and picks the one with the
most populated `topic` + `clinicalTopic` entries as the source of truth.
That keeps labels consistent across files without hardcoding any specific
filename — adding a new krok file later still picks up the same taxonomy.

Usage:
    python3 topic_classify.py <BLOCK_ID>
        e.g. python3 topic_classify.py krok-file-4

Behaviour:
    - Mandatory arg: BLOCK_ID. Reads `src/data/imports/<BLOCK_ID>.enriched.json`.
    - Falls back to `src/data/imports/<BLOCK_ID>.json` if no enriched file exists
      (lets you classify pre-enrichment too).
    - Raw model output dumped to `.tmp_rewrite/<BLOCK_ID>_enrich/topic_classify.raw.txt`
      if that workdir exists (created by the enrich pipeline); otherwise to
      `.tmp_rewrite/<BLOCK_ID>_topic_classify.raw.txt`.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
IMPORTS_DIR = REPO_ROOT / "src" / "data" / "imports"


def resolve_target(block_id: str) -> Path:
    for suffix in (".enriched.json", ".json"):
        p = IMPORTS_DIR / f"{block_id}{suffix}"
        if p.exists():
            return p
    sys.exit(f"no enriched or raw file for block_id={block_id!r} in {IMPORTS_DIR}")


def resolve_taxonomy_source(skip_block_id: str) -> Path:
    """Pick the krok-file with the richest existing topic+clinicalTopic coverage.

    Scans every `krok-file-N.json` / `.enriched.json` (excluding the one being
    classified), counts how many questions have both `topic` and `clinicalTopic`
    populated, and returns the file with the most. Falls back to alphabetical
    first if none have any topics. Ensures the taxonomy reference is always
    derived from existing data, not a hardcoded filename.
    """
    pattern = re.compile(r"^(krok-file-\d+)(?:\.enriched)?\.json$")
    candidates: dict[str, Path] = {}
    for path in IMPORTS_DIR.iterdir():
        m = pattern.match(path.name)
        if not m or m.group(1) == skip_block_id:
            continue
        # Prefer .enriched.json over raw when both exist for the same fid
        fid = m.group(1)
        existing = candidates.get(fid)
        if existing is None or (path.name.endswith(".enriched.json") and not existing.name.endswith(".enriched.json")):
            candidates[fid] = path
    if not candidates:
        sys.exit(f"no taxonomy source: no other krok-file-N(.enriched).json found in {IMPORTS_DIR}")

    def topic_coverage(p: Path) -> int:
        try:
            data = json.loads(p.read_text())
            qs = data["blocks"][0]["questions"]
            return sum(1 for q in qs if q.get("topic") and q.get("clinicalTopic"))
        except Exception:
            return 0

    best = max(candidates.values(), key=lambda p: (topic_coverage(p), p.name))
    return best


def resolve_raw_dump(block_id: str) -> Path:
    workdir = REPO_ROOT / ".tmp_rewrite" / f"{block_id}_enrich"
    if workdir.is_dir():
        return workdir / "topic_classify.raw.txt"
    fallback = REPO_ROOT / ".tmp_rewrite"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback / f"{block_id}_topic_classify.raw.txt"


def taxonomy_from_reference(reference: Path) -> tuple[list[str], list[str]]:
    ref = json.loads(reference.read_text())
    qs = ref["blocks"][0]["questions"]
    topics = [t for t, _ in Counter(q.get("topic") for q in qs if q.get("topic")).most_common()]
    clinicals = [t for t, _ in Counter(q.get("clinicalTopic") for q in qs if q.get("clinicalTopic")).most_common()]
    return topics, clinicals


def build_prompt(topics: list[str], clinicals: list[str]) -> str:
    topic_list = "\n".join(f"  - {t}" for t in topics)
    clin_list = "\n".join(f"  - {t}" for t in clinicals)
    return f"""\
Ти — викладач КРОК 2 «Фізична терапія». Тобі дано список питань (українською).
Для кожного питання визнач рівно два поля:

1) topic — одна з категорій КРОК-діяльності (СУВОРО з цього списку, без перекладу й перефразування):
{topic_list}

2) clinicalTopic — клінічна спеціальність, до якої належить питання (СУВОРО з цього списку):
{clin_list}

Якщо питання справді не підходить до жодної категорії в clinicalTopic — постав «Загальна фізична терапія».

ФОРМАТ ВИХОДУ — рівно один JSON-об'єкт без обгортки:
{{
  "results": [
    {{"number": 1, "topic": "...", "clinicalTopic": "..."}},
    {{"number": 2, "topic": "...", "clinicalTopic": "..."}}
    ...
  ]
}}

Правила:
- Включи ВСІ номери, що отримав на вході.
- Значення topic та clinicalTopic мають збігатися ДОСЛІВНО з елементами списків вище.
- Без коментарів, без вступу, без markdown — тільки JSON.
"""


def build_input(enriched: dict) -> str:
    qs = enriched["blocks"][0]["questions"]
    lines = []
    for q in qs:
        n = q["number"]
        stem = q["question"].replace("\n", " ").strip()
        correct = q.get("correctAnswerText", "")
        lines.append(f"{n}. {stem}\n   ✓ Правильна: {correct}")
    return "\n\n".join(lines)


def call_claude(prompt: str, user_msg: str) -> str:
    proc = subprocess.run(
        [
            "claude", "-p",
            "--model", "claude-opus-4-7",
            "--system-prompt", prompt,
            "--output-format", "text",
        ],
        input=user_msg,
        capture_output=True,
        text=True,
        timeout=900,
    )
    if proc.returncode != 0:
        sys.exit(f"claude exited {proc.returncode}: {proc.stderr[:500]}")
    return proc.stdout


def extract_json(raw: str) -> dict:
    s = raw.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    s = re.sub(r",(\s*[\]}])", r"\1", s)
    depth = 0
    start = -1
    for i, ch in enumerate(s):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                chunk = s[start:i + 1]
                try:
                    return json.loads(chunk)
                except json.JSONDecodeError:
                    start = -1
    sys.exit("could not extract JSON from response")


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: topic_classify.py <BLOCK_ID>")
    block_id = sys.argv[1]

    target = resolve_target(block_id)
    raw_dump = resolve_raw_dump(block_id)
    enriched = json.loads(target.read_text())

    reference = resolve_taxonomy_source(skip_block_id=block_id)
    print(f"taxonomy source: {reference.name}")
    topics, clinicals = taxonomy_from_reference(reference)
    print(f"taxonomy: {len(topics)} topics, {len(clinicals)} clinical topics")

    qs = enriched["blocks"][0]["questions"]
    prompt = build_prompt(topics, clinicals)
    user_msg = f"Класифікуй ці {len(qs)} питань:\n\n" + build_input(enriched)

    print(f"calling Opus 4.7 with {len(user_msg)} chars input...")
    raw = call_claude(prompt, user_msg)
    raw_dump.write_text(raw)
    out = extract_json(raw)

    results = out.get("results", [])
    print(f"got {len(results)} classifications")
    by_num = {r["number"]: r for r in results}

    missing = []
    bad_topic = []
    bad_clinical = []
    topic_set = set(topics)
    clin_set = set(clinicals)
    for q in qs:
        n = q["number"]
        r = by_num.get(n)
        if not r:
            missing.append(n)
            continue
        t = r.get("topic")
        ct = r.get("clinicalTopic")
        if t not in topic_set:
            bad_topic.append((n, t))
            t = topics[0]
        if ct not in clin_set:
            bad_clinical.append((n, ct))
            ct = "Загальна фізична терапія" if "Загальна фізична терапія" in clin_set else clinicals[0]
        q["topic"] = t
        q["clinicalTopic"] = ct

    target.write_text(json.dumps(enriched, ensure_ascii=False, indent=2))

    print(f"applied to {len(qs) - len(missing)} questions; missing={missing}; "
          f"bad_topic={len(bad_topic)} bad_clinical={len(bad_clinical)}")
    print()
    print("topic distribution after classification:")
    for t, c in Counter(q.get("topic") for q in qs).most_common():
        print(f"  {c:>3}  {t}")
    print("clinicalTopic distribution after classification:")
    for t, c in Counter(q.get("clinicalTopic") for q in qs).most_common():
        print(f"  {c:>3}  {t}")


if __name__ == "__main__":
    main()
