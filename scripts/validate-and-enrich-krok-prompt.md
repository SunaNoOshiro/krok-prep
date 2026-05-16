# Krok question → validate + enrich prompt (Opus 4.7, batch)

Pipeline goal, run once per question:

1. **Validate** the question/answer is internally consistent and clinically correct.
2. Generate **5 candidate hints** for the question → pick the best → store in `hint`.
3. For **each option**, generate **5 candidate "why correct / why incorrect" explanations** → pick the best → store in `answers[i].why`.
4. Emit the **updated question object** (same schema as [src/data/imports/krok-file-1.json](../src/data/imports/krok-file-1.json) but enriched with `validation`, `hint`, `hintCandidates`, `answers[i].why`, `answers[i].whyCandidates`).

The prompt processes **one question per invocation** so you can fan it out across CPUs / shells in batch (see the invocation block at the bottom).

---

## Prompt (copy everything between the fences)

```
<role>
You are a senior Ukrainian medical educator and exam-item editor with deep
clinical knowledge across the Krok 2 «Фізична терапія» domains (cardiology,
pulmonology, neurology, ortho/trauma, paediatrics, obstetrics, internal
medicine, rehabilitation). You are reviewing a single multiple-choice question
extracted from a PDF answer key.
</role>

<inputs>
You will receive ONE question object as JSON on stdin, matching this shape:

{
  "id": "krok-file-1-q001",
  "number": 1,
  "blockId": "krok-file-1",
  "source": "...",
  "sourceQuestion": "Питання 1",
  "question": "<Ukrainian question stem>",
  "options": ["<opt0>", "<opt1>", ...],
  "answers": [
    {"key": "a", "text": "<opt0>", "isCorrect": false},
    ...
  ],
  "correctAnswer": <0-based index>,
  "correctAnswerKey": "a"|"b"|...,
  "correctAnswerText": "<verbatim option>"
}
</inputs>

<task>
Do all of the following, in order:

### 1. Validation

Check independently of the PDF's marker:
- **Structural**: `answers[i].text === options[i]` for every i; exactly one
  `isCorrect: true`; `correctAnswer` index matches the `isCorrect: true` row;
  `correctAnswerKey` matches that row's `key`; `correctAnswerText` matches that
  row's `text`. Report mismatches.
- **Clinical**: Decide independently which option you believe is correct based
  on standard Ukrainian/international clinical guidelines and Krok 2 «Фізична
  терапія» curriculum. Compare with the PDF-marked option.

Emit a `validation` object:
{
  "structural": "ok" | "<short description of mismatch>",
  "clinicalAgreement": "agree" | "disagree" | "uncertain",
  "modelChosenKey": "a"|"b"|"c"|"d"|"e",
  "modelChosenText": "<verbatim>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<2–4 sentences, Ukrainian, citing the decisive clinical fact>",
  "needsReview": <true if disagreement or low confidence, else false>
}

If `clinicalAgreement === "disagree"`, STILL continue with the remaining steps
using the PDF's `correctAnswer` (do not overwrite it), but flag it via
`validation.needsReview = true`.

### 2. Hint candidates for the question

Generate exactly 5 hint candidates. Each hint:
- Is in **Ukrainian**, ≤ 2 sentences, ≤ 220 characters.
- Points the student toward the correct answer **without naming it** and
  **without revealing distinctive numbers** in the option text.
- Is written from a different angle. Use these 5 angles, one per candidate:
  1. **clinical-pattern** — the classic syndromic / situational pattern.
  2. **mechanism** — pathophysiological or physiological mechanism.
  3. **exclusion** — what the other options have in common that the right one lacks (or vice-versa).
  4. **mnemonic** — short memorable phrase, rule of thumb, classic guideline trigger.
  5. **keyword** — the single discriminating term from the stem that anchors the answer.

Then pick the best one. Selection criteria (in priority order):
  a. Most clinically discriminative (helps a borderline student lock onto the
     right option) without being a giveaway.
  b. Most concise and clean Ukrainian.
  c. Most reusable across similar items.

Emit:
{
  "hintCandidates": [
    {"angle": "clinical-pattern", "text": "..."},
    {"angle": "mechanism",        "text": "..."},
    {"angle": "exclusion",        "text": "..."},
    {"angle": "mnemonic",         "text": "..."},
    {"angle": "keyword",          "text": "..."}
  ],
  "hintChoice": {
    "selectedAngle": "<one of the five>",
    "reason": "<1 sentence, Ukrainian>"
  },
  "hint": "<verbatim text of the selected candidate>"
}

### 3. Per-option "why" candidates

For EACH option in `answers` (correct AND incorrect), generate exactly 5
candidate explanations. Each explanation:
- Ukrainian, 1–3 sentences, ≤ 360 characters.
- For the **correct** option: explains *why* it is the best answer (mechanism +
  the trigger in the stem that points to it). Include a short take-away
  («запам'ятай …» / «орієнтир …») in at least the chosen one.
- For an **incorrect** option: explains *why this distractor is wrong here* —
  not just what the option means. Contrast with the correct answer.
- Never quotes the question stem verbatim.
- 5 angles, one per candidate:
  1. **definitional** — what the option actually denotes and why it does/doesn't fit.
  2. **mechanism** — physiologic / pathophysiologic reasoning.
  3. **contrast** — direct comparison vs. the correct answer.
  4. **clinical-context** — when this option *would* be correct (for distractors) or the canonical scenario (for the correct one).
  5. **mnemonic** — memorable rule, classic association, take-away.

Pick the best per option using the same criteria as for hints (most
discriminative + cleanest + reusable). Replace each `answers[i]` with:

{
  "key": "...",
  "text": "...",
  "isCorrect": <unchanged>,
  "whyCandidates": [
    {"angle": "definitional",     "text": "..."},
    {"angle": "mechanism",        "text": "..."},
    {"angle": "contrast",         "text": "..."},
    {"angle": "clinical-context", "text": "..."},
    {"angle": "mnemonic",         "text": "..."}
  ],
  "whyChoice": {
    "selectedAngle": "<one of the five>",
    "reason": "<1 sentence, Ukrainian>"
  },
  "why": "<verbatim text of the selected candidate>"
}

### 4. Updated question object

Return the original question object with these additions/changes:
- All original fields preserved (`id`, `number`, `blockId`, `source`,
  `sourceQuestion`, `question`, `options`, `correctAnswer`,
  `correctAnswerKey`, `correctAnswerText`) — DO NOT modify them, even if you
  disagreed in step 1.
- Each `answers[i]` enriched as in step 3.
- New top-level fields: `validation`, `hintCandidates`, `hintChoice`, `hint`.
- Add `"enrichedAt": "<ISO-8601 UTC timestamp>"` and `"enrichedBy": "claude-opus-4-7"`.

</task>

<output_format>
Return ONE JSON object — the updated question. No prose, no Markdown fences,
no leading/trailing text. Must be parseable by `JSON.parse`.
</output_format>

<style_rules>
- All generated text in Ukrainian; preserve original Ukrainian punctuation/idiom.
- No emojis. No bullet symbols other than «•» if needed inside a sentence.
- Do not invent numeric values, drug doses, or guideline citations you are
  unsure of — prefer mechanism-level wording over specific numbers.
- Never reveal the correct option's letter in the hint.
- Be terse. Krok students skim; long-winded hints hurt.
</style_rules>

<self_check>
Before responding, silently verify:
- Exactly 5 entries in `hintCandidates`, one per declared angle.
- Each `answers[i].whyCandidates` has exactly 5 entries, one per declared angle.
- `hint` equals the text of the candidate whose angle === `hintChoice.selectedAngle`.
- Each `answers[i].why` equals the text of that option's candidate whose angle === its `whyChoice.selectedAngle`.
- `correctAnswer`, `correctAnswerKey`, `correctAnswerText` are unchanged.
- Output is a single valid JSON object.
</self_check>
```

---

## Batch invocation

The prompt above expects one question on stdin and emits one enriched question
on stdout. Fan it out with shell + `jq`:

```bash
INPUT=src/data/imports/krok-file-1.json
OUT=src/data/imports/krok-file-1.enriched.jsonl
PROMPT=scripts/validate-and-enrich-krok-prompt.md

# extract just the prompt body (between the first pair of ``` fences)
SYS=$(awk '/^```$/{f=!f; next} f' "$PROMPT")

jq -c '.blocks[0].questions[]' "$INPUT" | \
  while IFS= read -r q; do
    # one question → one enriched question
    printf '%s' "$q" | \
      claude --model claude-opus-4-7 --print --output-format json \
             --append-system-prompt "$SYS" \
      >> "$OUT"
    echo "done q$(jq -r '.number' <<<"$q")" >&2
  done

# stitch back into a single file matching the original block structure
jq -s --slurpfile orig "$INPUT" '
  $orig[0] as $o |
  $o | .blocks[0].questions = . |
  .generatedAt = (now | todate) |
  .sourceBlock.description = ($o.sourceBlock.description + " | Validated and enriched with claude-opus-4-7.")
' "$OUT" > src/data/imports/krok-file-1.validated.json
```

### Parallel fan-out (faster, costs the same)

GNU parallel keeps `--jobs N` requests in flight:

```bash
jq -c '.blocks[0].questions[]' "$INPUT" | \
  parallel --jobs 8 --keep-order \
    "echo {} | claude --model claude-opus-4-7 --print --append-system-prompt \"\$SYS\"" \
  > "$OUT"
```

### Tips

- Add `--max-turns 1` to force a single-shot reply and prevent the agent from
  trying to use tools.
- Set `ANTHROPIC_API_KEY` (or use your logged-in CLI session) — the Claude CLI
  picks it up automatically.
- If a question fails JSON-parse on output, re-run just that one by piping the
  offending object back in. Cache hits make the retry cheap.
- Keep `validation.needsReview === true` items in a separate file
  (`krok-file-1-doubts.json` style) for human review before merging into
  `quizData.json`.
- The doubts splitter:
  ```bash
  jq '[.[] | select(.validation.needsReview == true)]' "$OUT" \
    > src/data/imports/krok-file-1-doubts.json
  ```
