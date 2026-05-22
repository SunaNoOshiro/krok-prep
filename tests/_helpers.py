"""Shared helpers for the test suite.

The pipelines shell out to `claude -p` / `codex exec` — both of which we mock
in tests via `unittest.mock.patch` on `subprocess.run`. The helpers in this
module build canned responses and stage fake workdirs that match the
on-disk layouts the pipeline scripts expect.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[1]
SKILL_DIR = REPO_ROOT / ".claude" / "skills" / "krok-pdf-enrich"
SKILL_SCRIPTS = SKILL_DIR / "scripts"
SKILL_RESOURCES = SKILL_DIR / "resources"
REVERIFY_DIR = REPO_ROOT / "scripts" / "reverification"
IMPORTS_DIR = REPO_ROOT / "src" / "data" / "imports"


def stage_skill_workdir(tmp: Path, block_id: str, src_json: Path) -> Path:
    """Lay out `tmp/src/data/imports/<BLOCK_ID>.json` + a workdir that mimics
    the SKILL.md stage-0 bootstrap. Returns the workdir path.

    Layout:
        tmp/
        ├── src/data/imports/<BLOCK_ID>.json    (copy of src_json)
        └── .tmp_rewrite/<BLOCK_ID>_enrich/
            ├── PROMPT.md                       (copy of ENRICH_PROMPT.md)
            ├── split.py, autofix.py, validate.py, merge.py, run.sh
            ├── batches/   results/   logs/
    """
    workdir = tmp / ".tmp_rewrite" / f"{block_id}_enrich"
    (workdir / "batches").mkdir(parents=True, exist_ok=True)
    (workdir / "results").mkdir(parents=True, exist_ok=True)
    (workdir / "logs").mkdir(parents=True, exist_ok=True)

    target_src = tmp / "src" / "data" / "imports" / f"{block_id}.json"
    target_src.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(src_json, target_src)

    for name in ("split.py", "autofix.py", "validate.py", "merge.py", "run.sh"):
        shutil.copy(SKILL_SCRIPTS / name, workdir / name)
    shutil.copy(SKILL_RESOURCES / "ENRICH_PROMPT.md", workdir / "PROMPT.md")
    (workdir / "run.sh").chmod(0o755)
    return workdir


def run_python_in(cwd: Path, script: str, *args: str) -> subprocess.CompletedProcess[str]:
    """Run a Python script with cwd=cwd (the convention the skill scripts use)."""
    return subprocess.run(
        [sys.executable, script, *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )


def reconstruct_results_from_enriched(workdir: Path, enriched_json: Path) -> int:
    """Populate workdir/results/qNNN.json from a published *.enriched.json file.

    Lets tests skip the (expensive, LLM-driven) enrichment stage by treating
    the published enrichment as the canonical "stage-3 output".
    """
    enriched = json.loads(enriched_json.read_text())
    results = workdir / "results"
    n = 0
    for q in enriched["blocks"][0]["questions"]:
        path = results / f"q{q['number']:03d}.json"
        path.write_text(json.dumps(q, ensure_ascii=False, indent=2))
        n += 1
    return n


def make_enriched_response(question_dict: dict[str, Any]) -> str:
    """Wrap a single enriched-question dict as the raw text response from
    a `claude -p` call (fenced JSON, trailing newline). Mirrors what the
    extractor in run.sh expects to parse.
    """
    return "```json\n" + json.dumps(question_dict, ensure_ascii=False, indent=2) + "\n```\n"


def make_topic_classify_response(items: list[dict[str, Any]]) -> str:
    """Wrap a `results` payload as a topic_classify.py raw response."""
    payload = {"results": items}
    return json.dumps(payload, ensure_ascii=False, indent=2)


def make_reverify_response(uid: str, key: str, confidence: str = "high") -> str:
    """Minimal response shape produced by REVERIFY_PROMPT.md (Opus path).
    Just enough for build_disputed.py to consume.
    """
    return json.dumps({
        "uid": uid,
        "verifiedBy": "opus-4.7(high)",
        "finalAnswer": {
            "key": key,
            "text": "<final answer text>",
            "confidence": confidence,
            "reasoning": "<mock test reasoning>",
        },
        "bestWhys": {
            key: {"source": "krok-file-test", "angle": "definitional", "text": "<best why>"}
        },
        "bestHint": {"source": "krok-file-test", "angle": "clinical-pattern", "text": "<best hint>"},
        "crossCheck": {"agreesWith": ["krok-file-test"], "disagreesWith": []},
    }, ensure_ascii=False, indent=2)


def make_codex_response(uid: str, key: str, confidence: str = "high") -> str:
    """Minimal codex response (matches scripts/reverification/codex-response.schema.json)."""
    return json.dumps({
        "uid": uid,
        "verifiedBy": "codex-gpt-5.5-xhigh",
        "finalAnswer": {
            "key": key,
            "text": "<final answer text>",
            "confidence": confidence,
            "reasoning": "<mock codex reasoning>",
        },
    }, ensure_ascii=False, indent=2)


@contextmanager
def mock_subprocess_run(responder: Callable[[list[str], str], str]):
    """Patch subprocess.run so any `claude`/`codex` invocation gets a canned
    response decided by `responder(argv, stdin_text)`.

    `responder` receives the full argv list and the stdin payload (if any)
    and must return the stdout string. Anything not matching falls through
    to the real subprocess.run.
    """
    real = subprocess.run

    def fake(argv, *args, **kwargs):
        cmd = argv[0] if argv else ""
        if isinstance(argv, (list, tuple)) and any(
            tool in (cmd, "") for tool in ("claude", "codex")
        ) or (isinstance(argv, list) and argv and argv[0] in ("claude", "codex")):
            stdin = kwargs.get("input", "") or ""
            stdout = responder(list(argv), stdin)
            return subprocess.CompletedProcess(
                args=argv, returncode=0, stdout=stdout, stderr=""
            )
        return real(argv, *args, **kwargs)

    with patch("subprocess.run", side_effect=fake) as mock:
        yield mock
