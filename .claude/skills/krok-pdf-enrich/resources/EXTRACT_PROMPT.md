# Krok PDF → JSON extraction prompt

Use this prompt with an LLM that can read the attached PDF. It produces a single
JSON file whose shape matches [src/data/imports/krok-file-8.json](../src/data/imports/krok-file-8.json)
(schema `krok-question-block.v1`). Only the directly-extractable fields are filled in;
enrichment fields (`topic`, `clinicalTopic`, `hint`, `explanation`,
`explanationDetails`, `verification`, `existingDatasetMatch`) are left out so a
later pipeline can add them.

---

## Prompt (copy everything below this line)

You are extracting multiple-choice Krok exam questions from a Ukrainian-language PDF.
The PDF lists questions sequentially. Each question has 4–5 lettered options
(а, б, в, г, д or a, b, c, d, e — both cases occur). **The correct option is
marked with a `+` sign** placed immediately before, after, or on the same line
as that option (e.g. `+ Глюкотолерантний тест`, `Глюкотолерантний тест +`, or
`г) +Глюкотолерантний тест`). Exactly one option per question is marked.

### Inputs you must determine before extracting

- `BLOCK_ID` — short kebab-case identifier, e.g. `krok-file-9`. Use it for both
  the block `id` and the question id prefix (`<BLOCK_ID>-q001`, `-q002`, …).
- `BLOCK_TITLE` — human title, e.g. `Крок файл 9`.
- `EXAM` — exam name, e.g. `Крок 2 Фізична терапія (UA)`.
- `SOURCE_FILE_NAME` — the PDF filename as supplied, e.g. `крок файл 9.pdf`.
- `SOURCE_FILE_PATH` — absolute path to the PDF (if known; otherwise omit).

### Extraction rules

1. **Preserve original Ukrainian text verbatim** — do not translate, paraphrase,
   correct typos, or normalise punctuation. Keep ё/ё, hyphens, em-dashes, and
   non-breaking spaces as they appear.
2. **Strip the `+` marker and the option letter prefix** (`а)`, `b.`, `1.` etc.)
   from every option text. The plus must not appear inside any `text` field.
3. Number questions sequentially starting at `1`, regardless of how the PDF
   numbers them. Pad IDs to three digits (`q001`, `q002`, …, `q150`).
4. `options` is a string array in original on-page order (top-to-bottom).
5. `answers` is an array of objects in the same order as `options`. For each:
   - `key`: lowercase letter starting at `a` (so first option is `a`, second
     `b`, etc., regardless of the Cyrillic/Latin letters the PDF used).
   - `text`: must equal the corresponding `options[i]` exactly.
   - `isCorrect`: `true` only for the option that had the `+` marker.
6. `correctAnswer` is the **zero-based** index of the correct option.
   `correctAnswerKey` is its letter (`a`–`e`). `correctAnswerText` is its
   verbatim text.
7. If a question contains a figure/image, add `"hasImage": true` and put a
   short description in `"imageNote"`. Do not invent image filenames.
8. If the PDF contains a question with **no `+` marker** or with **more than
   one `+` marker**, still emit the question but set `correctAnswer: null`,
   `correctAnswerKey: null`, `correctAnswerText: null`, every
   `answers[i].isCorrect: false`, and add `"extractionIssue"` with a short
   reason (e.g. `"no plus marker"`, `"multiple plus markers"`).
9. Skip pages that are pure cover/answer-key/instructions; only emit question
   objects.

### Output

Return **only** valid JSON, no prose, no Markdown fences. Top-level shape:

```jsonc
{
  "schemaVersion": "krok-question-block.v1",
  "generatedAt": "<ISO-8601 timestamp, e.g. 2026-05-16T12:00:00+03:00>",
  "sourceBlock": {
    "id": "<BLOCK_ID>",
    "title": "<BLOCK_TITLE>",
    "exam": "<EXAM>",
    "sourceFileName": "<SOURCE_FILE_NAME>",
    "sourceFilePath": "<SOURCE_FILE_PATH or omit>",
    "questionCount": <integer>,
    "description": "Імпортовано з PDF як окремий блок."
  },
  "blocks": [
    {
      "id": "<BLOCK_ID>",
      "title": "<BLOCK_TITLE>",
      "exam": "<EXAM>",
      "source": "<SOURCE_FILE_NAME>",
      "questionCount": <integer>,
      "questions": [
        {
          "id": "<BLOCK_ID>-q001",
          "number": 1,
          "blockId": "<BLOCK_ID>",
          "source": "<SOURCE_FILE_NAME>",
          "sourceQuestion": "Питання 1",
          "question": "<verbatim question text>",
          "options": ["<opt a>", "<opt b>", "<opt c>", "<opt d>", "<opt e>"],
          "answers": [
            { "key": "a", "text": "<opt a>", "isCorrect": false },
            { "key": "b", "text": "<opt b>", "isCorrect": false },
            { "key": "c", "text": "<opt c>", "isCorrect": false },
            { "key": "d", "text": "<opt d>", "isCorrect": true  },
            { "key": "e", "text": "<opt e>", "isCorrect": false }
          ],
          "correctAnswer": 3,
          "correctAnswerKey": "d",
          "correctAnswerText": "<opt d>"
        }
        // … remaining questions
      ]
    }
  ]
}
```

### Self-check before finalising

- `sourceBlock.questionCount` equals `blocks[0].questions.length`.
- Every question has exactly one `isCorrect: true` answer **or** an
  `extractionIssue` field.
- `correctAnswer` equals the index of the answer where `isCorrect === true`.
- `answers[i].text === options[i]` for every `i`.
- No `+` characters appear inside any `text`, `question`, or `options` value
  (unless the `+` is part of the genuine medical text, e.g. `Rh+`).
- IDs are unique, sequential, and zero-padded (`q001`…`qNNN`).

### File naming

Save the output as `src/data/imports/<BLOCK_ID>.json` (e.g.
`src/data/imports/krok-file-9.json`), matching the layout already used for
`krok-file-8.json`.
