"""End-to-end test of the krok-pdf-enrich skill's pure-Python stages.

Stages covered (no LLM calls — the published `krok-file-1.enriched.json` is
re-used as canned "stage-3 enrichment output" so we can exercise everything
that comes after):

    stage 2  split.py        → produces N batch JSON files
    stage 6  autofix.py      → idempotent on already-clean data
    stage 7  validate.py     → reports 0 issues
    stage 8  merge.py        → produces <BLOCK_ID>.enriched.json + -doubts.json
                                matching the published shapes

The LLM-driven stages (1 extract / 3-4 enrich / 9 topic_classify) are tested
separately in `test_one_batch_full_flow.py` via mocked `subprocess.run`.

Stage 1 (PDF→JSON extraction) genuinely requires a real LLM + a real PDF, so
we don't exercise it end-to-end here; instead `test_templates_and_prompts.py`
sanity-checks that the prompt + output schema are coherent.
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tests._helpers import (
    IMPORTS_DIR,
    REPO_ROOT,
    reconstruct_results_from_enriched,
    run_python_in,
    stage_skill_workdir,
)

BLOCK_ID = "krok-file-1"
FIXTURE_SRC = IMPORTS_DIR / f"{BLOCK_ID}.json"
FIXTURE_ENRICHED = IMPORTS_DIR / f"{BLOCK_ID}.enriched.json"


class SkillPipelineTest(unittest.TestCase):
    """Run split → (mock enrich via reconstructed results) → autofix → validate → merge."""

    def setUp(self) -> None:
        self.tmp_ctx = tempfile.TemporaryDirectory()
        self.tmp = Path(self.tmp_ctx.name)
        self.workdir = stage_skill_workdir(self.tmp, BLOCK_ID, FIXTURE_SRC)

    def tearDown(self) -> None:
        self.tmp_ctx.cleanup()

    def test_stage2_split_produces_per_question_batches(self) -> None:
        result = run_python_in(self.workdir, "split.py", BLOCK_ID)
        self.assertEqual(result.returncode, 0, msg=result.stderr)

        batches = sorted((self.workdir / "batches").glob("q*.json"))
        src = json.loads(FIXTURE_SRC.read_text())
        expected_n = len(src["blocks"][0]["questions"])
        self.assertEqual(len(batches), expected_n,
            f"expected {expected_n} batches, got {len(batches)}")

        # Spot-check a batch: must be a full question dict with options + answers
        q1 = json.loads(batches[0].read_text())
        self.assertEqual(q1["number"], 1)
        self.assertIn("options", q1)
        self.assertIn("answers", q1)
        self.assertEqual(len(q1["answers"]), len(q1["options"]))

    def test_stage7_validate_reports_zero_issues_on_published_enrichment(self) -> None:
        """After stage 3-4 (enrich, mocked here by reconstructing from published
        data), validate.py must report 0 structural issues."""
        run_python_in(self.workdir, "split.py", BLOCK_ID)
        n = reconstruct_results_from_enriched(self.workdir, FIXTURE_ENRICHED)
        self.assertGreater(n, 0, "fixture has no enriched questions")

        result = run_python_in(self.workdir, "validate.py", BLOCK_ID)
        self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)
        self.assertIn("0 issues", result.stdout,
            f"validate.py should report 0 issues; got:\n{result.stdout}")

    def test_stage6_autofix_idempotent_on_clean_data(self) -> None:
        """autofix must touch 0 files when fed already-clean enrichment results."""
        run_python_in(self.workdir, "split.py", BLOCK_ID)
        reconstruct_results_from_enriched(self.workdir, FIXTURE_ENRICHED)

        # snapshot file bytes pre-autofix
        before = {p.name: p.read_bytes() for p in (self.workdir / "results").glob("q*.json")}
        result = run_python_in(self.workdir, "autofix.py", BLOCK_ID)
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        after = {p.name: p.read_bytes() for p in (self.workdir / "results").glob("q*.json")}

        changed = [k for k in before if before[k] != after.get(k)]
        self.assertEqual(changed, [],
            f"autofix should be idempotent on clean data; changed: {changed}")

    def test_stage8_merge_produces_enriched_and_doubts(self) -> None:
        """merge.py must produce both output files with the expected schemas."""
        run_python_in(self.workdir, "split.py", BLOCK_ID)
        reconstruct_results_from_enriched(self.workdir, FIXTURE_ENRICHED)

        result = run_python_in(self.workdir, "merge.py", BLOCK_ID)
        self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)

        # merge.py writes to ../../src/data/imports/<BLOCK_ID>.enriched.json
        out_enriched = self.tmp / "src" / "data" / "imports" / f"{BLOCK_ID}.enriched.json"
        out_doubts = self.tmp / "src" / "data" / "imports" / f"{BLOCK_ID}-doubts.json"
        self.assertTrue(out_enriched.exists(), f"missing {out_enriched}")
        self.assertTrue(out_doubts.exists(), f"missing {out_doubts}")

        enriched = json.loads(out_enriched.read_text())
        self.assertIn("blocks", enriched)
        self.assertGreater(len(enriched["blocks"][0]["questions"]), 0)
        q0 = enriched["blocks"][0]["questions"][0]
        for k in ("id", "number", "options", "answers", "correctAnswer",
                 "correctAnswerKey", "correctAnswerText", "hint",
                 "hintCandidates", "validation"):
            self.assertIn(k, q0, f"merged question missing key {k!r}")

        doubts = json.loads(out_doubts.read_text())
        self.assertEqual(doubts["schemaVersion"], "krok-question-doubts.v1")
        self.assertEqual(doubts["sourceBlockId"], BLOCK_ID)
        for k in ("questionCount", "reviewItemCount", "aiOverridePdfCount"):
            self.assertIn(k, doubts["summary"])


if __name__ == "__main__":
    unittest.main()
