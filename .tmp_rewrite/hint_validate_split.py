#!/usr/bin/env python3
"""Split all hints into validation batches."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / "src" / "data"
BATCHES_DIR = ROOT / "hint_validate_batches"

SOURCES = {
    "edkiData": DATA / "edkiData.json",
    "quizData": DATA / "quizData.json",
    "selfControlData": DATA / "selfControlData.json",
    "krok-file-8": DATA / "imports" / "krok-file-8.json",
}

BATCH_SIZE = 15

def load_source(name: str, path: Path) -> list:
    """Load questions from a source file."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    if name == "krok-file-8":
        return raw["blocks"][0]["questions"]
    return raw

def split_into_batches():
    """Split all questions into validation batches."""
    BATCHES_DIR.mkdir(exist_ok=True)

    all_questions = []
    for name in sorted(SOURCES.keys()):
        questions = load_source(name, SOURCES[name])
        for q in questions:
            # Get the correct answer text from options/answers
            correct_idx = q.get("correctAnswer", q.get("correct_answer", 0))
            options = q.get("options", q.get("answers", []))
            answer_text = ""
            if isinstance(options, list) and correct_idx < len(options):
                opt = options[correct_idx]
                if isinstance(opt, dict):
                    answer_text = opt.get("text", str(opt))
                else:
                    answer_text = str(opt)

            all_questions.append({
                "source": name,
                "id": q["id"],
                "question": q.get("question", ""),
                "answer": answer_text,
                "hint": q.get("hint", ""),
            })

    print(f"Total questions: {len(all_questions)}")

    batch_num = 0
    for i in range(0, len(all_questions), BATCH_SIZE):
        batch = all_questions[i:i+BATCH_SIZE]
        batch_file = BATCHES_DIR / f"validate_batch_{batch_num:03d}.json"

        batch_data = {
            "batch_num": batch_num,
            "total_in_batch": len(batch),
            "questions": batch
        }

        batch_file.write_text(
            json.dumps(batch_data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        batch_num += 1

    print(f"Created {batch_num} batches (size={BATCH_SIZE})")

if __name__ == "__main__":
    split_into_batches()
