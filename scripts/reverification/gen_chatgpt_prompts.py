#!/usr/bin/env python3
"""Generate one self-contained ChatGPT prompt per uncertain question.

For each item in `needs-reverification.json`, emit a Markdown prompt
(`chatgpt-prompts/<uid>.md`) that the user can paste into ChatGPT (or any
chat-based LLM) for a manual second opinion. Each prompt is fully self-contained
(no shared context) and instructs the model to:

  1. Solve the question independently *before* reading existing answers.
  2. Compare its verdict against the table of existing per-file answers.
  3. Cite ASIA/ICF/clinical guidelines where applicable.

Also writes a generic `INDEPENDENT_AGENT_PROMPT.md` template the user can use
with sister models (Gemini, GPT, Claude web) for blind cross-verification.
"""

from __future__ import annotations

import json
from pathlib import Path

REVERIFY_DIR = Path(__file__).resolve().parent
INPUT = REVERIFY_DIR / "needs-reverification.json"
OUT_DIR = REVERIFY_DIR / "chatgpt-prompts"
RESPONSES_DIR = OUT_DIR / "responses"
INDEP_TEMPLATE = REVERIFY_DIR / "INDEPENDENT_AGENT_PROMPT.md"


def pick_canonical_source(sources: list[dict]) -> dict:
    """Pick the source with the most options/data to use as the canonical
    question text. Prefer enriched sources."""
    enriched = [s for s in sources if s.get("enriched")]
    pool = enriched if enriched else sources
    return max(pool, key=lambda s: (len(s.get("options", [])), len(s.get("question", ""))))


def format_options(options: list[str]) -> str:
    letters = "ABCDE"
    return "\n".join(f"{letters[i]}. {opt}" for i, opt in enumerate(options))


def source_table(sources: list[dict]) -> str:
    rows = ["| Файл | Ключ | Текст відповіді | Confidence | Коментар AI-валідатора |",
            "|------|------|-----------------|------------|------------------------|"]
    for s in sources:
        key = (s.get("correctAnswerKey") or "?").upper()
        text = s.get("correctAnswerText") or "?"
        v = s.get("validation") or {}
        conf = v.get("confidence") or "—"
        reasoning = (v.get("reasoning") or "").replace("\n", " ").replace("|", "\\|")
        if len(reasoning) > 220:
            reasoning = reasoning[:220] + "…"
        rows.append(f"| `{s['file']}` | {key} | {text} | {conf} | {reasoning or '—'} |")
    return "\n".join(rows)


def build_prompt(item: dict) -> str:
    uid = item["uid"]
    canon = pick_canonical_source(item["sources"])
    question = canon["question"]
    options = canon["options"]
    reasons = ", ".join(item["reasons"])

    # Per-source verdict stub — one row per actual source in this item
    per_source_stub = ",\n      ".join(
        f'{{"file": "{s["file"]}", "qId": "{s.get("qId", "<qId>")}", "claimedKey": "{(s.get("correctAnswerKey") or "?").lower()}", "agrees": <true|false>, "verdict": "correct|incorrect|ambiguous", "reason": "<1-2 речення>"}}'
        for s in item["sources"]
    )

    return f"""# Експертна перевірка спірного питання КРОК 2 «Фізична терапія»

Ти — клінічний експерт із фізичної терапії та реабілітації, який допомагає валідувати питання іспиту КРОК 2 / ЄДКІ.

## Чому це питання потрапило на перевірку

`{reasons}`

## Правила відповіді

1. **Спочатку розв'яжи питання незалежно.** Прочитай умову і варіанти, оберіть свою відповідь, обґрунтуй її **до того**, як подивишся таблицю «Існуючі версії відповіді» нижче.
2. **Цитуй стандарти**: ASIA, ICF, NIHSS, FIM, Bobath, Brunnstrom, MMT, протоколи EULAR/AHA/ESC тощо — те, що релевантне.
3. **Не аргументуй з більшості**. Якщо твоя думка збігається з більшістю — це збіг, а не наслідування.
4. **Особлива пастка ASIA grade**: пам'ятай, що ASIA C/D описує м'язи **нижче** неврологічного рівня. М'язи **на рівні і вище** збережені. Це часта помилка моделей-валідаторів.

---

## Питання (uid: `{uid}`)

{question}

{format_options(options)}

---

## КРОК 1. Твоя відповідь (НЕ дивись поки в таблицю нижче)

Дай свою відповідь у форматі:

```
Обрана літера: __
Текст: __
Confidence: high / medium / low
Обґрунтування (3–5 речень з посиланням на стандарт): __
```

---

## КРОК 2. Звірка з наявними версіями

Подивись таблицю нижче — це відповіді, які вже згенерували різні AI-проходи валідації по цьому питанню.

{source_table(item["sources"])}

Тепер для **кожного рядка** напиши:
- Чи погоджуєшся з цим джерелом? (так / ні / частково)
- Якщо ні — конкретно у чому помилка обґрунтування?

---

## КРОК 3. Фінальний вердикт

```
Фінальна відповідь: __
Confidence: __
Хто з джерел правий: __
Хто помиляється і чому: __
Чи є альтернативне трактування питання, яке робить відповідь неоднозначною? __
```

---

## КРОК 4. (Опціонально) Краще пояснення

Якщо в одному з джерел є якісне clinical reasoning для правильної відповіді — процитуй його дослівно. Якщо всі пояснення слабкі — напиши, яке з них найменш погане і чому.

---

## КРОК 5. ⬇️ COPY-PASTE BLOCK ⬇️

В кінці своєї відповіді **обов'язково** виведи структурований JSON у кодовому блоці точно такого формату — користувач скопіює його у файл `chatgpt-prompts/responses/{uid}.json`, а скрипт `build_disputed.py` потім автоматично змерджить у `disputed-questions.json`:

```json
{{
  "uid": "{uid}",
  "verifiedBy": "chatgpt",
  "verifiedAt": "<ISO-8601 дата+час>",
  "independentChoice": {{
    "key": "a|b|c|d|e",
    "text": "<verbatim текст обраного варіанту>",
    "confidence": "high|medium|low",
    "reasoning": "<3-5 речень із посиланням на стандарт>"
  }},
  "crossCheck": {{
    "perSource": [
      {per_source_stub}
    ]
  }},
  "finalAnswer": {{
    "key": "a|b|c|d|e",
    "text": "<verbatim>",
    "confidence": "high|medium|low",
    "reasoning": "<3-5 речень>",
    "agreeingSources": ["<файл(и) з perSource, де agrees=true>"],
    "disagreeingSources": ["<файл(и) з perSource, де agrees=false>"]
  }},
  "bestWhys": {{
    "a": {{"source": "<file>", "angle": "<angle>", "text": "<verbatim>", "reason": "<коротко>"}},
    "b": {{"source": null, "angle": null, "text": null, "reason": "no candidate matches verified answer"}},
    "c": {{"source": null, "angle": null, "text": null, "reason": "no candidate matches verified answer"}},
    "d": {{"source": null, "angle": null, "text": null, "reason": "no candidate matches verified answer"}},
    "e": {{"source": null, "angle": null, "text": null, "reason": "no candidate matches verified answer"}}
  }},
  "bestHint": {{"source": "<file>", "angle": "<angle>", "text": "<verbatim>", "reason": "<коротко>"}},
  "notes": "<коротко: що варто переглянути людині-арбітру, або null>"
}}
```

**Важливо**:
- JSON має бути валідним (без коментарів, без trailing commas, з подвійними лапками).
- `crossCheck.perSource[]` має містити рядок для **кожного** файлу з таблиці вище.
- `confidence` лише з набору {{`high`, `medium`, `low`}}.
- Якщо немає підхожого whyCandidate для якогось key — постав `null` (або об'єкт з полем `reason`).
"""


def response_stub(item: dict) -> dict:
    """Empty skeleton the user fills by pasting ChatGPT's JSON output.

    Shape matches `codex-response.schema.json` (which mirrors REVERIFY_PROMPT.md
    output). build_disputed.py treats a stub as "unfilled" if all of
    independentChoice/finalAnswer/crossCheck are null.
    """
    return {
        "uid": item["uid"],
        "verifiedBy": None,
        "verifiedAt": None,
        "independentChoice": None,
        "crossCheck": None,
        "finalAnswer": None,
        "bestWhys": None,
        "bestHint": None,
        "notes": None,
    }


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    RESPONSES_DIR.mkdir(exist_ok=True)
    with INPUT.open() as f:
        payload = json.load(f)
    stubs_created = 0
    stubs_skipped = 0
    for item in payload["items"]:
        uid = item["uid"]
        (OUT_DIR / f"{uid}.md").write_text(build_prompt(item))
        stub_path = RESPONSES_DIR / f"{uid}.json"
        # Never clobber a stub the user may have already filled in
        if stub_path.exists() and stub_path.stat().st_size > 0:
            stubs_skipped += 1
            continue
        stub_path.write_text(json.dumps(response_stub(item), ensure_ascii=False, indent=2))
        stubs_created += 1
    print(f"Wrote {len(payload['items'])} prompts to {OUT_DIR}")
    print(f"Response stubs: {stubs_created} created, {stubs_skipped} preserved (already filled) in {RESPONSES_DIR}")

    # Generic independent-agent template
    INDEP_TEMPLATE.write_text("""# Шаблон промту для незалежної верифікації КРОК 2 питання

> Скопіюй це повідомлення цілком у Claude / GPT / Gemini / будь-який інший чат-LLM.
> Підстав питання в плейсхолдер. Жодних натяків на існуючі відповіді не давай.

---

Ти — досвідчений клінічний експерт із фізичної терапії та реабілітації (ЄДКІ / КРОК 2, спеціальність «Фізична терапія, ерготерапія»).

Я даю тобі тестове питання з варіантами. Твоя задача:

1. Розв'язати незалежно — самостійно, не покладаючись на жодне зовнішнє джерело окрім твоїх медичних знань.
2. Дати чітку відповідь у форматі:
   - **Літера + текст** обраного варіанту
   - **Confidence**: high / medium / low
   - **Обґрунтування 3–5 речень** з посиланням на стандарт (ASIA, ICF, NIHSS, FIM, Bobath, Brunnstrom, MMT, EULAR / AHA / ESC settings, MIT/PT-протоколи рівневих ушкоджень тощо)
3. Окремо: вказати, які ще варіанти можуть бути плутаниною (`distractor`) і чому саме вони хибні.
4. Особлива пастка: якщо питання згадує **ASIA grade C/D** — пам'ятай, що ця класифікація описує силу м'язів **нижче** неврологічного рівня; м'язи **на рівні і вище** збережені.

### Питання

<встав сюди умову>

<встав сюди A./B./C./D./E. варіанти>

### Дай відповідь у форматі

```
Літера: __
Текст: __
Confidence: __
Обґрунтування: __
Чому інші варіанти хибні:
  A — __
  B — __
  C — __
  D — __
  E — __
Підозрілі джерела помилок у таких питаннях (для self-check): __
```
""")
    print(f"Wrote independent-agent template: {INDEP_TEMPLATE}")


if __name__ == "__main__":
    main()
