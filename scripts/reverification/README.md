# Cross-file Question Re-verification Pipeline

Виявляє дублікати / неоднозначності у `*.enriched.json` файлах КРОК 2, проганяє повторну верифікацію через дві незалежні моделі (Claude Opus 4.8 max + GPT-5.5 xhigh), і автоматично виправляє те, де моделі сходяться, а решту виносить у карантин для ручної перевірки.

## Що вирішує

1. **Cross-file дублікати**: одне питання в кількох `krok-file-{1,2,3,8}.enriched.json` могло отримати різні `correctAnswerKey` при першій валідації. Pipeline знаходить такі пари і з'ясовує правду через 2 незалежні моделі.
2. **Medium-confidence та `needsReview` записи**: запитання, які перший enrichment не зміг впевнено валідувати — проганяємо повторно з кращими промтами і обома моделями.
3. **AI override of PDF**: випадки де AI під час enrichment не погодився з PDF — переперевіряємо незалежно.

## Pipeline (загальна схема)

```
                    src/data/imports/
                  krok-file-{1,2,3,8}.enriched.json
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Step 1: dedupe_questions.py           │
        │   normalize text → group → mismatch?  │
        ▼                                       ▼
  cross-file-duplicates.json              (consensus groups)
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Step 2: collect_uncertain.py          │
        │   union of:                            │
        │     - cross-file mismatches            │
        │     - medium confidence                │
        │     - AI/PDF disagreement              │
        │     - needsReview flag                 │
        ▼
  needs-reverification.json (65 items на цей момент)
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Step 3: split_batches.py              │
        │   one JSON per uid                    │
        ▼
  batches/<uid>.json
                            │
                            ▼
    ┌──────────────────────────┬──────────────────────────┐
    ▼                          ▼                          ▼
  run_opus.sh             run_codex.sh           gen_chatgpt_prompts.py
  (Opus 4.8 via           (GPT-5.5 xhigh via      (manual ChatGPT,
   claude CLI)             codex CLI)              optional 3rd vote)
    │                          │                          │
    ▼                          ▼                          ▼
  results/<uid>.json    chatgpt-prompts/         chatgpt-prompts/
                        responses/<uid>.json     <uid>.md (prompts)
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ build_disputed.py                     │
        │   merge votes → status taxonomy       │
        ▼
  src/data/disputed-questions.json
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ resolve_disputes.py                        │
        │   • update enriched.json (consensus)  │
        │   • quarantine (ambiguous)            │
        ▼
  src/data/imports/
    krok-file-N.enriched.json (mutated)
    krok-disputed-quarantine.json (NEW — quarantine bucket)
```

## Файли і їх ролі

### Скрипти

| Файл | Призначення |
|---|---|
| [dedupe_questions.py](dedupe_questions.py) | Step 1 — пошук дублікатів між enriched-файлами. Нормалізація: NFKD + Cyr↔Lat homoglyph fold + strip пунктуації. |
| [collect_uncertain.py](collect_uncertain.py) | Step 2 — об'єднує дублікати-mismatches + medium-confidence + AI/PDF disagreements + needsReview |
| [split_batches.py](split_batches.py) | Розбиває `needs-reverification.json` на per-uid файли для CLI-конвеєрів |
| [REVERIFY_PROMPT.md](REVERIFY_PROMPT.md) | System prompt для Opus 4.8 і codex. КРОК 1: blind judgment, КРОК 2: cross-check, КРОК 3: final, КРОК 4: best-of пояснень із існуючих кандидатів. |
| [run_opus.sh](run_opus.sh) | Opus 4.8 max через `claude -p --model claude-opus-4-8`. Пише в `results/`. `xargs -P 3`. |
| [run_codex.sh](run_codex.sh) | GPT-5.5 (xhigh reasoning) через `codex exec --output-schema --output-last-message`. Підписка ChatGPT, не API. `xargs -P 2`. Пише в `chatgpt-prompts/responses/`. |
| [codex-response.schema.json](codex-response.schema.json) | JSON Schema для `--output-schema` codex. Гарантує валідну форму виходу. |
| [gen_chatgpt_prompts.py](gen_chatgpt_prompts.py) | Генерує self-contained `chatgpt-prompts/<uid>.md` (опціональна ручна перевірка через web ChatGPT) + порожні стаби в `responses/<uid>.json`. |
| [INDEPENDENT_AGENT_PROMPT.md](INDEPENDENT_AGENT_PROMPT.md) | Generic blind-verification шаблон для сторонніх агентів (Gemini, GPT, Claude web). |
| [build_disputed.py](build_disputed.py) | Агрегує: оригінальні sources + Opus result + codex/ChatGPT result → `src/data/disputed-questions.json` з 5-категорійним статусом фінального decision. |
| [resolve_disputes.py](resolve_disputes.py) | Застосовує консенсусні fixes до `*.enriched.json`, виносить ambiguous у карантин. `--dry-run` для preview. |
| [restore_from_quarantine.py](restore_from_quarantine.py) | Повертає питання з карантину назад в `*.enriched.json` (за uid або all). |

### Генеровані артефакти

| Файл | Опис |
|---|---|
| `cross-file-duplicates.json` | Step 1 output — групи питань що з'являються в 2+ файлах |
| `needs-reverification.json` | Step 2 output — повний контекст для re-verification (включно з усіма whyCandidates/hintCandidates) |
| `batches/<uid>.json` | Один JSON на uid, вхід для CLI-конвеєрів |
| `results/<uid>.json` | Opus 4.8 max вихід — finalAnswer + bestWhys + bestHint + crossCheck |
| `chatgpt-prompts/<uid>.md` | Self-contained промт для ручного web ChatGPT (опційно) |
| `chatgpt-prompts/responses/<uid>.json` | codex GPT-5.5 вихід (АБО ручний ChatGPT якщо ти переписав вручну) |
| `logs/` | Опуси: stderr + raw outputs при failure |

### Артефакти поза `scripts/reverification/`

| Файл | Опис |
|---|---|
| [src/data/disputed-questions.json](../../src/data/disputed-questions.json) | Фінальний агрегований arbitration файл — 65 items зі статусами, голосами обох моделей, candidate breakdown |
| [src/data/imports/krok-disputed-quarantine.json](../../src/data/imports/krok-disputed-quarantine.json) | Quarantine bucket — 10 ambiguous питань вилучених з `*.enriched.json` |

## End-to-end runbook

Pipeline працює для **довільного набору `krok-file-N(.enriched).json`** у `src/data/imports/` — нові файли підхоплюються автоматично (`dedupe_questions.py` сканує glob, не hardcoded список). Регенеровані артефакти (`batches/`, `results/`, `logs/`, `chatgpt-prompts/`, `needs-reverification.json`, `cross-file-duplicates.json`) gitignored — кожен прогін будує їх з нуля.

```bash
cd scripts/reverification

# Cвіже виявлення дублікатів + збір непевних
python3 dedupe_questions.py            # auto-discovers krok-file-*.json в src/data/imports
python3 collect_uncertain.py
python3 split_batches.py
python3 gen_chatgpt_prompts.py         # створює промти і пусті response-стаби

# Прогін через Opus 4.8 max (Claude). ~20-25 хв на 65 items при JOBS=3.
./run_opus.sh

# Прогін через GPT-5.5 xhigh (codex CLI, ChatGPT subscription). ~15 хв на JOBS=2.
./run_codex.sh

# Опційно: для still-conflict items — ручний ChatGPT через web
#   1. скопіюй chatgpt-prompts/<uid>.md в ChatGPT
#   2. встав JSON-блок з відповіді в chatgpt-prompts/responses/<uid>.json
#      (повністю замінивши stub; codex run skip-ить вже-заповнені файли)

# Агрегувати все
python3 build_disputed.py

# Preview fix plan
python3 resolve_disputes.py --dry-run

# Застосувати fixes + перенести ambiguous у quarantine
python3 resolve_disputes.py
```

### Додавання нового `krok-file-N`

1. Завершити enrich pipeline (`krok-pdf-enrich` skill) — отримаєш `src/data/imports/krok-file-N.enriched.json`.
2. Запустити runbook вище. `dedupe_questions.py` автоматично включить новий файл у пошук дублікатів.
3. Якщо файл вводить нові duplicate groups з попередніми — вони з'являться в `cross-file-duplicates.json` і пройдуть повну re-verification.

## Status taxonomy (у `disputed-questions.json` → `finalDecision.status`)

| Status | Що означає | Що робиться `resolve_disputes.py` |
|---|---|---|
| `unanimous_agreement` | усі джерела + Opus + codex кажуть одне і те саме | no-op (вже правильно) |
| `models_agree_with_majority_sources` | Opus + codex обидва погоджуються, і **≥1 джерело** з ними | **fix** — оновити неправильне джерело |
| `models_agree_disagree_with_sources` | Opus + codex обидва погоджуються, але **ЖОДНЕ джерело** з ними | **quarantine** — обережно, потенційна помилка в усіх джерелах |
| `models_split_on_sources` | Opus + codex розійшлися, кожен підкріплений ≥1 джерелом | **quarantine** — справжня неоднозначність |
| `models_split_one_alone` | Opus + codex розійшлися, тільки один підкріплений джерелом | **quarantine** — ймовірно одна модель помилилась |
| `awaiting_reverification` / `single_model_only` | прогін не повний | (не повинно зустрічатись після повного циклу) |

## `disputeHistory` audit trail

Кожне fix-нуте питання отримує запис у `disputeHistory[]`:

```json
{
  "fixedAt": "2026-05-20T17:02:16.534642+00:00",
  "fixedBy": ["opus-4.7(high)", "codex-gpt-5.5(high)", "krok-file-3"],
  "previousCorrectKey": "e",
  "newCorrectKey": "c",
  "uid": "dup-q117",
  "status": "models_agree_with_majority_sources"
}
```

Це дозволяє ретроспективно дивитися: ХТО сказав що правильна відповідь — `c`, і чому ми пишемо `c` зараз.

## Quarantine schema (`krok-disputed-quarantine.json`)

```json
{
  "schemaVersion": "krok-quarantine.v1",
  "summary": { "totalQuarantined": 10, "byStatus": {...}, "filesAffected": [...] },
  "items": [
    {
      "uid": "dup-q022",
      "status": "models_split_on_sources",
      "reasons": ["cross_file_mismatch"],
      "modelVotes": { "opus-4.7": "a", "codex-gpt-5.5": "b" },
      "modelConfidence": { "opus-4.7": "high", "codex-gpt-5.5": "high" },
      "removedFrom": [
        {
          "file": "krok-file-2", "qId": "krok-file-2-q022", "qNumber": 22,
          "originalBlockIndex": 0, "originalQuestionIndex": 21
        }
      ],
      "questionsSnapshot": {
        "krok-file-2": <повний оригінальний question dict>
      },
      "manualReviewNotes": null
    }
  ]
}
```

`questionsSnapshot` зберігає **повну** структуру enrichment (`answers`, `whyCandidates`, `hintCandidates`, `validation` — все), тож відновлення повертає питання у точно той же стан що до карантину.

## Restore workflow

Після ручної перевірки спірного питання — щоб повернути його у `*.enriched.json`:

```bash
python3 scripts/reverification/restore_from_quarantine.py --list      # переглянути карантин
python3 scripts/reverification/restore_from_quarantine.py dup-q022    # повернути одне
python3 scripts/reverification/restore_from_quarantine.py --all       # повернути все
```

Скрипт:
1. Вставляє snapshot назад у `<file_id>.enriched.json` за `originalQuestionIndex` (або в кінець якщо індекс став невалідним)
2. Інкрементує `questionCount` у блоці і `sourceBlock`
3. Видаляє item з `krok-disputed-quarantine.json`

**Перед restore** найкраще вручну виправити `questionsSnapshot[<file>].correctAnswerKey` (та супутні поля) у файлі карантину якщо знаєш правильну відповідь — інакше повернеш зі старим неправильним станом.

## Reproducibility & idempotency

- Усі скрипти можна перезапускати; ті, що пишуть results — мають skip-if-done логіку
- `resolve_disputes.py` **не ідемпотентний**: повторний прогін після фіксу не зробить нічого зайвого, але повторний прогін після того як ти вручну змінив enriched.json — може перезаписати твої правки. Запускати тільки один раз після нового `build_disputed.py`.
- Усі модифікації `*.enriched.json` йдуть через git, тож `git diff` / `git checkout` — стандартний rollback.

## Known limitations

- **Option drift**: коли одне й те саме питання у різних файлах має різні набори опцій (різна кількість, або інший переклад), pipeline робить best-effort fuzzy text match. Якщо консенсусний текст не знаходиться в опціях disagreeing source — `resolve_disputes.py` пропускає з WARN. 3 такі випадки лишилися як були: q025, q045, q061 (файл-3).
- **False positives у дедупі**: якщо question text майже однаковий між файлами але опції різні (різні питання насправді) — pipeline зарахує як дублікат. Безпечно, бо AI у переvereficiation бачить обидва набори опцій і не змішує їх; також `optionDrift: true` прапор у duplicates output попереджає.
- **Codex galiucinaції**: 1 випадок `models_split_one_alone` (`krok-file-2-q044`) — codex проти Opus + обох джерел. Винесений у карантин.
- **ChatGPT subscription quota**: при дуже великих re-verification раундах (>100 викликів за раз) може досягти ChatGPT Plus daily limit. JOBS=2 — обережне значення.
