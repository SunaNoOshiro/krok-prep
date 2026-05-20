#!/usr/bin/env python3
"""Extract krok-file-3 text into the required JSON schema."""
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

BLOCK_ID = "krok-file-3"
BLOCK_TITLE = "Крок файл 3"
EXAM = "Крок 2 Фізична терапія (UA)"
SOURCE_FILE_NAME = "крок файл 3.pdf"

HERE = Path(__file__).parent
RAW = (HERE / "raw.txt").read_text(encoding="utf-8")
OUT = HERE.parent.parent / "src" / "data" / "imports" / f"{BLOCK_ID}.json"

# A question starts with "<n>. " at the start of a line.
QUESTION_RE = re.compile(r"^(\d+)\.\s+", re.MULTILINE)
# Option lines start with "A.", "B.", ... and may contain inline next options.
OPTION_LETTER_RE = re.compile(r"\b([A-E])\.\s")
LINE_STARTS_OPTION_RE = re.compile(r"^([A-E])\.\s")


def split_questions(text: str):
    """Yield (number, body) chunks based on leading '<N>. ' markers."""
    starts = [(int(m.group(1)), m.start()) for m in QUESTION_RE.finditer(text)]
    for i, (n, s) in enumerate(starts):
        e = starts[i + 1][1] if i + 1 < len(starts) else len(text)
        yield n, text[s:e].rstrip()


def parse_options(chunk: str):
    """Return (question_text, list of (letter, text, is_correct)).

    Handles both line-per-option and inline-option layouts and tolerates
    'X. -' placeholder lines.
    """
    lines = chunk.splitlines()
    # Drop the leading "N. " from the first line.
    head = re.sub(r"^\d+\.\s+", "", lines[0])

    # We accumulate the question stem until we encounter a line that begins
    # with "A. " — every line before that belongs to the stem.
    stem_parts = [head]
    body_lines = []
    saw_option = False
    for line in lines[1:]:
        if not saw_option and LINE_STARTS_OPTION_RE.match(line) and line[0] == "A":
            saw_option = True
            body_lines.append(line)
        elif saw_option:
            body_lines.append(line)
        else:
            stem_parts.append(line)

    question = " ".join(p.strip() for p in stem_parts if p.strip()).strip()

    # Now flatten body_lines and split into individual options. A single line
    # may contain multiple options like "A. foo + B. bar C. baz".
    # First, join lines that *don't* start with a letter onto the previous
    # option (continuation lines).
    joined = []
    for line in body_lines:
        if LINE_STARTS_OPTION_RE.match(line):
            joined.append(line)
        else:
            if joined:
                joined[-1] = joined[-1].rstrip() + " " + line.strip()
            # else: stray text, ignore
    # Now expand inline options: split each line on " <LETTER>. " boundaries.
    expanded = []  # list of raw "X. ..." strings
    for line in joined:
        # Find all positions where a letter-option marker starts. The first
        # one is at index 0. Subsequent ones come from " X. " interior.
        markers = [(0, line[0])]
        for m in re.finditer(r"\s([A-E])\.\s", line):
            # Only treat as a new option if the letter is the *next* expected
            # one; this guards against false positives like "Бартел Індекс (BI)".
            expected = chr(ord(markers[-1][1]) + 1)
            if m.group(1) == expected:
                markers.append((m.start() + 1, m.group(1)))
        for j, (start, _letter) in enumerate(markers):
            end = markers[j + 1][0] - 1 if j + 1 < len(markers) else len(line)
            expanded.append(line[start:end].strip())

    # Parse each "X. ..." entry.
    options = []
    for entry in expanded:
        m = re.match(r"^([A-E])\.\s*(.*)$", entry)
        if not m:
            continue
        letter = m.group(1)
        text = m.group(2).strip()
        is_correct = text.endswith("+")
        if is_correct:
            text = text[:-1].rstrip()
        # Strip placeholder "-"
        if text == "-" or text == "":
            text = None
        options.append((letter, text, is_correct))

    # Ensure ordered A..E if present, drop placeholders (text=None),
    # then remap to consecutive a,b,c,d,e keys per schema.
    by_letter = {l: (t, c) for (l, t, c) in options}
    kept = []
    for L in "ABCDE":
        if L in by_letter:
            t, c = by_letter[L]
            if t is None:
                continue  # missing option
            kept.append((t, c))
    out = [(chr(ord("a") + i), t, c) for i, (t, c) in enumerate(kept)]
    return question, out


def build_question(n: int, question: str, options: list) -> dict:
    correct_idx = next((i for i, (_, _, c) in enumerate(options) if c), None)
    qid = f"{BLOCK_ID}-q{n:03d}"
    answers = [
        {"key": k, "text": t, "isCorrect": c} for (k, t, c) in options
    ]
    obj = {
        "id": qid,
        "number": n,
        "blockId": BLOCK_ID,
        "source": SOURCE_FILE_NAME,
        "sourceQuestion": f"Питання {n}",
        "question": question,
        "options": [t for (_, t, _) in options],
        "answers": answers,
    }
    if correct_idx is not None:
        obj["correctAnswer"] = correct_idx
        obj["correctAnswerKey"] = options[correct_idx][0]
        obj["correctAnswerText"] = options[correct_idx][1]
    else:
        obj["correctAnswer"] = None
        obj["correctAnswerKey"] = None
        obj["correctAnswerText"] = None
        obj["extractionIssue"] = "no plus marker"
    return obj


def main() -> None:
    questions = []
    for n, chunk in split_questions(RAW):
        q_text, options = parse_options(chunk)
        # Sanity: every option text must not contain a stray "+".
        cleaned = []
        for k, t, c in options:
            t2 = t.rstrip()
            if t2.endswith("+"):
                t2 = t2[:-1].rstrip()
                c = True
            cleaned.append((k, t2, c))
        # Validate exactly one correct.
        n_correct = sum(1 for (_, _, c) in cleaned if c)
        if n_correct != 1:
            # Fall back: keep but flag.
            obj = build_question(n, q_text, cleaned)
            if n_correct == 0:
                obj["extractionIssue"] = "no plus marker"
            else:
                obj["extractionIssue"] = "multiple plus markers"
            questions.append(obj)
            continue
        questions.append(build_question(n, q_text, cleaned))

    kyiv = timezone(timedelta(hours=3))
    payload = {
        "schemaVersion": "krok-question-block.v1",
        "generatedAt": datetime.now(kyiv).strftime("%Y-%m-%dT%H:%M:%S%z")[:-2]
        + ":" + datetime.now(kyiv).strftime("%z")[-2:],
        "sourceBlock": {
            "id": BLOCK_ID,
            "title": BLOCK_TITLE,
            "exam": EXAM,
            "sourceFileName": SOURCE_FILE_NAME,
            "questionCount": len(questions),
            "description": "Імпортовано з PDF як окремий блок.",
        },
        "blocks": [
            {
                "id": BLOCK_ID,
                "title": BLOCK_TITLE,
                "exam": EXAM,
                "source": SOURCE_FILE_NAME,
                "questionCount": len(questions),
                "questions": questions,
            }
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT} with {len(questions)} questions")

    # Quick sanity report.
    issues = [q for q in questions if "extractionIssue" in q]
    print(f"extraction issues: {len(issues)}")
    for q in issues:
        print(f"  q{q['number']:03d}: {q['extractionIssue']}")


if __name__ == "__main__":
    main()
