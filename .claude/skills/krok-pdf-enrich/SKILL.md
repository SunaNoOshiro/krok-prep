---
name: krok-pdf-enrich
description: Extract Ukrainian Krok 2 «Фізична терапія» exam questions from a PDF (correct answer marked with `+`), then validate each question against Opus 4.7's independent clinical judgment, generate 5 candidate hints (best-of) plus 5 per-option `why` candidates (best-of), and emit a clean enriched JSON block + a sidecar doubts file mirroring `krok-file-8-doubts.json`. AI override applied on high-confidence clinical disagreements with the PDF.
---

# Krok PDF → validate + enrich pipeline

End-to-end skill that turns a Ukrainian Krok 2 PDF answer-key into a fully enriched JSON dataset compatible with `src/data/imports/krok-file-N.json` and `src/data/imports/krok-file-N-doubts.json` in the **krok-prep** repo.

## When to use

User says any of: "import krok file 3", "enrich krok-file-2", "process this krok PDF", or attaches/points at a PDF named `крок файл N.pdf` and wants Q/A extracted + hints/whys generated.

**Skip** if the user only wants extraction (no enrichment) — use the lighter [resources/EXTRACT_PROMPT.md](resources/EXTRACT_PROMPT.md) directly.

## What you'll need from the user

- **PDF path** — absolute path to the source PDF.
- **Block id** — short kebab-case slug, e.g. `krok-file-2`. Determines all output file names.
- **Optional** — block title (default `Крок файл N` derived from id), exam name (default `Крок 2 Фізична терапія (UA)`).

Ask only if not provided; defaults are usually fine.

## Pipeline stages

### 0. Bootstrap a working dir

```bash
WORKDIR=".tmp_rewrite/${BLOCK_ID}_enrich"
mkdir -p "$WORKDIR"/{batches,results,logs}
cp .claude/skills/krok-pdf-enrich/resources/ENRICH_PROMPT.md "$WORKDIR/PROMPT.md"
cp .claude/skills/krok-pdf-enrich/scripts/{split.py,run.sh,autofix.py,validate.py,merge.py} "$WORKDIR/"
chmod +x "$WORKDIR/run.sh"
```

`split.py`, `autofix.py`, `validate.py`, and `merge.py` all take `<BLOCK_ID>` as their first arg. `run.sh` is cwd-sensitive (it `cd`s into its own directory) and reads `PROMPT.md` + `batches/` from there — block-id agnostic.

### 1. Extract PDF → JSON (skip if `src/data/imports/<BLOCK_ID>.json` already exists)

Feed the user's PDF to a separate Claude call using [resources/EXTRACT_PROMPT.md](resources/EXTRACT_PROMPT.md) as the prompt. The output is the unenriched block JSON; save it to `src/data/imports/<BLOCK_ID>.json`. This step must populate the user-provided `BLOCK_ID`, `BLOCK_TITLE`, `EXAM`, and `SOURCE_FILE_NAME` at the top of the prompt before invocation.

If the user already has the extracted JSON (e.g. `src/data/imports/krok-file-1.json` already exists), skip this stage and proceed to stage 2.

### 2. Split into per-question batches

```bash
( cd "$WORKDIR" && python3 split.py "$BLOCK_ID" )
# writes $WORKDIR/batches/q001.json … qNNN.json
```

### 3. Smoke-test on q001 (always do this before launching the full batch)

```bash
( cd "$WORKDIR" && ./run.sh 1 1 1 )
```

Takes 60–120 s on Opus 4.7. Inspect `$WORKDIR/results/q001.json` against the schema described below before launching the rest. If the smoke test fails, **stop** and diagnose — do not fan out.

### 4. Launch the full batch in background

```bash
( cd "$WORKDIR" && nohup ./run.sh > logs/_run.log 2>&1 & )
```

`run.sh` with no args processes every batch in `batches/` with `JOBS=3` (the safe default — see hard rules at the bottom). The runner is **skip-if-done**: rerun freely after an interruption and it picks up where it left off.

Expect ~80–150 s per question. 150 questions × ~100 s / 3 = ~80 min wall clock.

### 5. Watch for rate-limit failures

A run can hit "You've hit your limit · resets HH:MM Europe/Kiev". Symptoms in `$WORKDIR/logs/_run.log`:

- Cluster of consecutive `FAIL` lines, all 1–2 s
- `$WORKDIR/logs/qNNN.raw.txt` contains the rate-limit message verbatim

When this happens:

1. Probe with `cat batches/q001.json | claude -p --model claude-opus-4-7 --system-prompt "reply OK" --output-format text` — if it answers `OK`, the limit has rolled off.
2. Delete the stale `.log` / `.raw.txt` dumps for the failed q###.
3. Re-launch with `JOBS=2`.

### 6. Auto-fix common per-result issues

```bash
( cd "$WORKDIR" && python3 autofix.py "$BLOCK_ID" )
```

Fixes (in order):

- Extra hint/why candidates beyond the 5 declared angles → trim, keep first occurrence of each angle.
- Hint candidate with `risk != "none"` → normalize to `none` (we keep the text).
- `hint` text drifted from selected candidate → resync verbatim.
- `answers[i].why` text drifted from selected candidate → resync verbatim.
- `answers[i].text != options[i]` (model normalized Ukrainian noun cases) → force `answers[i].text = options[i]`.
- `correctAnswerText` out of sync with `answers[correctAnswer].text` → resync.

### 7. Validate structure

```bash
( cd "$WORKDIR" && python3 validate.py "$BLOCK_ID" )
```

Exits 0 + reports "0 issues" when clean. If anything remains, they are likely model-side bad output (truncated, missing `correctAnswer`, duplicated option) — re-run those specific questions:

```bash
( cd "$WORKDIR" \
  && for n in 043 076 110; do rm -f results/q$n.json logs/q$n.log logs/q$n.raw.txt; done \
  && ./run.sh 1 "" 2 )    # skip-if-done picks up only the deleted ones (END defaults to auto)
```

If a result still fails, check `logs/qNNN.raw.txt` for a trailing comma — the extractor in `run.sh` already strips them, but very malformed output may need a one-off `python3 -c "import json,re,pathlib; ..."` rescue.

### 8. Merge into final outputs

```bash
( cd "$WORKDIR" && python3 merge.py "$BLOCK_ID" )
```

Writes:

- `src/data/imports/<BLOCK_ID>.enriched.json` — all questions with `hint`, per-option `why`, `hintCandidates`, `whyCandidates`, `validation`, and `pdfOriginal` (only on AI overrides).
- `src/data/imports/<BLOCK_ID>-doubts.json` — sidecar mirroring `krok-file-8-doubts.json` schema. One entry per question where the AI overrode the PDF OR flagged the answer as needing clinical review.

### 9. Report to the user

Always surface:

- How many questions enriched / total.
- How many AI overrides (`aiOverridePdfCount` from the doubts summary).
- How many need-review items (`needsClinicalReviewCount`).
- A bullet list of overrides as `q### [pdf → ai]` so the user can spot-check (look at the doubts file's `items[]`).
- Explicitly flag questions where `pdfCorrectAnswer === "None"` — these are PDF entries the extractor couldn't find a `+` marker for, so the AI filled the answer in.

## Output schema (per question in the enriched file)

```jsonc
{
  "id": "...", "number": N, "blockId": "...", "source": "...",
  "sourceQuestion": "Питання N", "question": "...",
  "options": ["...", "..."],
  "answers": [
    {
      "key": "a", "text": "...", "isCorrect": false,
      "whyCandidates": [
        {"angle": "definitional|mechanism|contrast|clinical-context|mnemonic", "text": "..."}
      ],
      "whyChoice": {"selectedAngle": "...", "reason": "..."},
      "why": "<= verbatim text of selected candidate"
    }
  ],
  "correctAnswer": 0, "correctAnswerKey": "a", "correctAnswerText": "...",
  "pdfOriginal": {                              // present only when AI overrode
    "correctAnswer": <old idx>, "correctAnswerKey": "...", "correctAnswerText": "...",
    "reason": "..."
  },
  "validation": {
    "structural": "ok | <msg>",
    "clinicalAgreement": "agree | disagree | uncertain",
    "modelChosenKey": "...", "modelChosenText": "...",
    "confidence": "high | medium | low",
    "reasoning": "...",
    "needsReview": true | false
  },
  "hintCandidates": [
    {"angle": "clinical-pattern|mechanism|framework|attention-marker|exclusion", "text": "...", "risk": "none"}
  ],
  "hintChoice": {"selectedAngle": "...", "reason": "..."},
  "hint": "<= verbatim text of selected candidate",
  "enrichedAt": "ISO-8601", "enrichedBy": "claude-opus-4-7"
}
```

## Hard rules

- **Never modify the source PDF JSON in place.** Outputs are sibling files (`*.enriched.json`, `*-doubts.json`); the original `src/data/imports/<BLOCK_ID>.json` stays untouched as the immutable extraction snapshot.
- **AI override only on `confidence === "high"` AND `clinicalAgreement === "disagree"`.** Medium/low-confidence disagreements leave the PDF answer in place but raise `needsReview: true`.
- **Don't parallelize past `JOBS=4`.** The Claude session rate limit will throttle you and waste cycles. `JOBS=3` is the sweet spot.
- **Don't run merge.py until validate.py reports 0 issues.** Bad structural results corrupt the enriched file.

## Resources

- [resources/EXTRACT_PROMPT.md](resources/EXTRACT_PROMPT.md) — PDF → JSON extraction prompt (stage 1).
- [resources/ENRICH_PROMPT.md](resources/ENRICH_PROMPT.md) — validate + 5 hint candidates + 5 per-option whys (stage 3+).

## Scripts

- [scripts/split.py](scripts/split.py) — split source block JSON into per-question batches.
- [scripts/run.sh](scripts/run.sh) — parallel `claude -p` runner, skip-if-done, with trailing-comma-tolerant JSON extractor.
- [scripts/autofix.py](scripts/autofix.py) — fix common drift (extra candidates, text resync, options↔answers alignment).
- [scripts/validate.py](scripts/validate.py) — structural validator; reports 0 issues when output is clean.
- [scripts/merge.py](scripts/merge.py) — produce final `<BLOCK_ID>.enriched.json` + `<BLOCK_ID>-doubts.json`.
