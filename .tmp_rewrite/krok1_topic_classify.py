#!/usr/bin/env python3
"""Classify topic + clinicalTopic for every question in krok-file-1.enriched.json
using one Opus 4.7 call. Writes the classification back into the enriched file.

The taxonomy is read directly from krok-file-8.json so the labels stay consistent.
"""
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENRICHED = ROOT / "src/data/imports/krok-file-1.enriched.json"
REFERENCE = ROOT / "src/data/imports/krok-file-8.json"


def taxonomy_from_reference() -> tuple[list[str], list[str]]:
    ref = json.loads(REFERENCE.read_text())
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
    enriched = json.loads(ENRICHED.read_text())
    topics, clinicals = taxonomy_from_reference()
    print(f"taxonomy: {len(topics)} topics, {len(clinicals)} clinical topics")

    prompt = build_prompt(topics, clinicals)
    user_msg = "Класифікуй ці 149 питань:\n\n" + build_input(enriched)

    print(f"calling Opus 4.7 with {len(user_msg)} chars input...")
    raw = call_claude(prompt, user_msg)
    Path(ROOT / ".tmp_rewrite/krok1_classify.raw.txt").write_text(raw)
    out = extract_json(raw)

    results = out.get("results", [])
    print(f"got {len(results)} classifications")
    by_num = {r["number"]: r for r in results}

    qs = enriched["blocks"][0]["questions"]
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
            t = topics[0]  # fallback to most-common — caller will see warning
        if ct not in clin_set:
            bad_clinical.append((n, ct))
            ct = "Загальна фізична терапія" if "Загальна фізична терапія" in clin_set else clinicals[0]
        q["topic"] = t
        q["clinicalTopic"] = ct

    ENRICHED.write_text(json.dumps(enriched, ensure_ascii=False, indent=2))

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
