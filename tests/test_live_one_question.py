"""Live end-to-end test of ONE krok question — full model × stage matrix.

Runs REAL `claude -p` (Opus 4.7) and `codex exec` (GPT-5 xhigh) calls. Both
go through subscription auth (Claude Pro/Max + ChatGPT Pro) — no per-call
API charges. Cost is just time (~6-12 min) and rate-limit consumption.

Gate (required to run):
    RUN_LIVE_LLM_TESTS=1                     # explicit opt-in
    `claude` CLI on PATH                     # opus stages
    `codex` CLI on PATH                      # codex stages

Optional:
    TEST_BLOCK_ID=krok-file-1                # which fixture to use (default)

Test matrix — each LLM-driven stage exercised against BOTH models:

                          Opus              codex
    1. extract        skipped (manual)  skipped (manual)
    2. enrich         test_02a_opus     test_02b_codex
    3. topic_classify test_03a_opus     test_03b_codex
    4. reverify       test_04a_opus     test_04b_codex
    5. consensus      test_05_consensus (compares the two reverify verdicts)

Run:
    RUN_LIVE_LLM_TESTS=1 python3 -m unittest tests.test_live_one_question -v
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tests._helpers import (
    IMPORTS_DIR,
    REPO_ROOT,
    REVERIFY_DIR,
    SKILL_RESOURCES,
    SKILL_SCRIPTS,
)

LIVE_ENABLED = os.environ.get("RUN_LIVE_LLM_TESTS") == "1"
HAS_CLAUDE = shutil.which("claude") is not None
HAS_CODEX = shutil.which("codex") is not None


def _sub_model_id(prompt: str, model_id: str) -> str:
    """Substitute {{MODEL_IDENTIFIER}} in REVERIFY_PROMPT.md so the model's
    `verifiedBy` field gets stamped correctly. Matches the sed substitution
    that `run_opus.sh` / `run_codex.sh` do in production.
    """
    return prompt.replace("{{MODEL_IDENTIFIER}}", model_id)


def _claude_call(system_prompt: str, user_input: str, *, timeout: int = 600) -> str:
    """Invoke `claude -p` with a system prompt + stdin user input. Returns raw stdout."""
    res = subprocess.run(
        ["claude", "-p",
         "--model", "claude-opus-4-7",
         "--system-prompt", system_prompt,
         "--output-format", "text"],
        input=user_input,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if res.returncode != 0:
        raise AssertionError(f"claude exited {res.returncode}\nstderr: {res.stderr[:400]}")
    return res.stdout


def _codex_call(system_prompt: str, user_input: str, schema_path: Path,
                last_message_path: Path, *, timeout: int = 600) -> dict:
    """Invoke `codex exec` matching `run_codex.sh` exactly. Returns the parsed
    schema-validated final message. Raises AssertionError on failure.
    """
    res = subprocess.run(
        ["codex", "exec",
         "--sandbox", "read-only",
         "--skip-git-repo-check",
         "--ephemeral",
         "--color", "never",
         "--output-schema", str(schema_path),
         "--output-last-message", str(last_message_path),
         system_prompt],
        input=user_input,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if res.returncode != 0:
        raise AssertionError(f"codex exited {res.returncode}\nstderr: {res.stderr[:400]}")
    if not last_message_path.exists() or last_message_path.stat().st_size == 0:
        raise AssertionError(f"codex produced empty output\nstderr: {res.stderr[:400]}")
    return json.loads(last_message_path.read_text().strip())


def _extract_balanced_json(raw: str) -> dict:
    """Mirror the JSON extractor in run.sh — strip fences, trailing commas,
    find the first balanced { ... } block.
    """
    import re
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
                return json.loads(chunk)
    raise AssertionError(f"no balanced JSON in:\n{raw[:500]}")


@unittest.skipUnless(LIVE_ENABLED, "set RUN_LIVE_LLM_TESTS=1 to enable (uses subscription quota)")
@unittest.skipUnless(HAS_CLAUDE, "claude CLI not on PATH")
class LiveOneQuestionPipelineTest(unittest.TestCase):
    """One real question through every LLM-driven pipeline stage.

    setUpClass loads / extracts the source block; each test runs sequentially
    against the SAME shared question. We pin the order by numbering test
    method names (test_01_, test_02a_, test_02b_, …) — unittest runs them
    alphabetically, so 02a runs before 02b, before 03a, etc.
    """

    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp_ctx = tempfile.TemporaryDirectory()
        cls.tmp = Path(cls._tmp_ctx.name)
        cls.block_id = os.environ.get("TEST_BLOCK_ID", "krok-file-1")

        # Populated by test_02a (opus enrich); shared with later stages.
        # test_02b/03b/04b (codex variants) only need self.question, not self.enriched.
        cls.question: dict | None = None
        cls.enriched: dict | None = None
        cls.opus_verdict: dict | None = None
        cls.codex_verdict: dict | None = None

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp_ctx.cleanup()

    # --- Stage 1: extract (always skipped — see module docstring) ----------

    @unittest.skip("PDF extraction is not CLI-testable; run manually in claude.ai web")
    def test_01_extract_from_pdf(self) -> None:
        pass  # documentation-only — kept so the stage order is visible in test output

    # --- Stage 2: enrich question #1 --- BOTH MODELS ----------------------

    def test_02a_enrich_via_opus(self) -> None:
        # Load question #1 from the fixture (since stage 1 is manual)
        fixture = IMPORTS_DIR / f"{self.block_id}.json"
        if not fixture.exists():
            self.skipTest(f"no fixture {fixture}")
        data = json.loads(fixture.read_text())
        type(self).question = data["blocks"][0]["questions"][0]

        enrich_prompt = (SKILL_RESOURCES / "ENRICH_PROMPT.md").read_text()
        raw = _claude_call(enrich_prompt, json.dumps(self.question, ensure_ascii=False))
        enriched = _extract_balanced_json(raw)

        # Required keys per SKILL.md output schema
        for k in ("id", "number", "options", "answers", "correctAnswer",
                  "correctAnswerKey", "correctAnswerText",
                  "validation", "hintCandidates", "hintChoice", "hint"):
            self.assertIn(k, enriched, f"enriched question missing {k!r}")

        self.assertEqual(len(enriched["hintCandidates"]), 5,
            "expected exactly 5 hint candidates")
        self.assertEqual(len(enriched["answers"][0]["whyCandidates"]), 5,
            "expected exactly 5 whyCandidates per option")
        self.assertIn(enriched["validation"]["clinicalAgreement"],
            ("agree", "disagree", "uncertain"))

        type(self).enriched = enriched
        print(f"  enriched q{enriched['number']}: "
              f"clinicalAgreement={enriched['validation']['clinicalAgreement']} "
              f"confidence={enriched['validation']['confidence']}")

    # --- Stage 3: topic classify --- BOTH MODELS --------------------------

    def test_03a_topic_classify_via_opus(self) -> None:
        if self.enriched is None:
            self.skipTest("stage 2 didn't produce an enriched question")

        # Stage a fake repo layout so topic_classify can find its taxonomy
        imports = self.tmp / "src" / "data" / "imports"
        imports.mkdir(parents=True, exist_ok=True)

        # One-question enriched file
        single = {
            "schemaVersion": "krok-question-block.v1",
            "sourceBlock": {"id": self.block_id, "title": "Live Test",
                            "exam": "Крок 2 Фізична терапія (UA)",
                            "sourceFileName": "live-test.pdf",
                            "questionCount": 1, "description": "live test"},
            "blocks": [{"id": self.block_id, "title": "Live Test",
                        "exam": "Крок 2 Фізична терапія (UA)",
                        "source": "live-test.pdf", "questionCount": 1,
                        "questions": [self.enriched]}],
        }
        (imports / f"{self.block_id}.enriched.json").write_text(
            json.dumps(single, ensure_ascii=False, indent=2)
        )
        # Need a "taxonomy donor" — copy krok-file-8.json (the canonical source)
        shutil.copy(IMPORTS_DIR / "krok-file-8.json", imports / "krok-file-8.json")

        # Import the real topic_classify and call main() with patched paths
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "topic_classify_live", SKILL_SCRIPTS / "topic_classify.py")
        topic_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(topic_mod)

        from unittest.mock import patch
        with patch.object(topic_mod, "IMPORTS_DIR", imports), \
             patch.object(topic_mod, "REPO_ROOT", self.tmp), \
             patch.object(sys, "argv", ["topic_classify.py", self.block_id]):
            topic_mod.main()

        result = json.loads((imports / f"{self.block_id}.enriched.json").read_text())
        q = result["blocks"][0]["questions"][0]
        self.assertIn("topic", q, "topic_classify didn't add `topic`")
        self.assertIn("clinicalTopic", q, "topic_classify didn't add `clinicalTopic`")
        self.assertTrue(q["topic"], "`topic` is empty")
        self.assertTrue(q["clinicalTopic"], "`clinicalTopic` is empty")
        print(f"  topic = {q['topic']!r}, clinicalTopic = {q['clinicalTopic']!r}")

    # --- Stage 4: reverify --- BOTH MODELS --------------------------------

    def test_04a_reverify_via_opus(self) -> None:
        if self.enriched is None:
            self.skipTest("stage 2 didn't produce an enriched question")

        # Build a reverification batch shape (matches collect_uncertain output)
        batch = {
            "uid": f"live-q{self.enriched['number']:03d}",
            "reasons": ["live_test"],
            "sources": [{
                "file": self.block_id,
                "enriched": True,
                "qId": self.enriched["id"],
                "qNumber": self.enriched["number"],
                "question": self.enriched["question"],
                "options": self.enriched["options"],
                "correctAnswerKey": self.enriched["correctAnswerKey"],
                "correctAnswerText": self.enriched["correctAnswerText"],
                "answers": self.enriched["answers"],
                "hintCandidates": self.enriched["hintCandidates"],
                "hintChoice": self.enriched["hintChoice"],
                "hint": self.enriched["hint"],
                "validation": self.enriched["validation"],
            }],
        }
        reverify_prompt = _sub_model_id(
            (REVERIFY_DIR / "REVERIFY_PROMPT.md").read_text(),
            "claude-opus-4-7",
        )
        raw = _claude_call(reverify_prompt, json.dumps(batch, ensure_ascii=False))
        verdict = _extract_balanced_json(raw)

        self.assertEqual(verdict["uid"], batch["uid"])
        self.assertEqual(verdict["verifiedBy"], "claude-opus-4-7",
            f"opus didn't fill placeholder correctly: {verdict.get('verifiedBy')!r}")
        self.assertIn("finalAnswer", verdict)
        self.assertIn(verdict["finalAnswer"]["key"], ("a", "b", "c", "d", "e"))
        self.assertIn(verdict["finalAnswer"]["confidence"], ("low", "medium", "high"))
        self.assertIn("bestWhys", verdict)
        self.assertIn("bestHint", verdict)

        type(self).opus_verdict = verdict
        print(f"  opus verdict: key={verdict['finalAnswer']['key']} "
              f"confidence={verdict['finalAnswer']['confidence']} "
              f"verifiedBy={verdict['verifiedBy']!r}")

    @unittest.skipUnless(HAS_CODEX, "codex CLI not on PATH")
    def test_04b_reverify_via_codex(self) -> None:
        if self.enriched is None:
            self.skipTest("stage 2 didn't produce an enriched question")

        batch = {
            "uid": f"live-q{self.enriched['number']:03d}",
            "reasons": ["live_test"],
            "sources": [{
                "file": self.block_id,
                "enriched": True,
                "qId": self.enriched["id"],
                "qNumber": self.enriched["number"],
                "question": self.enriched["question"],
                "options": self.enriched["options"],
                "correctAnswerKey": self.enriched["correctAnswerKey"],
                "correctAnswerText": self.enriched["correctAnswerText"],
                "answers": self.enriched["answers"],
            }],
        }
        prompt = _sub_model_id(
            (REVERIFY_DIR / "REVERIFY_PROMPT.md").read_text(),
            "codex-gpt-5.5-xhigh",
        )
        schema = REVERIFY_DIR / "codex-response.schema.json"
        last_message = self.tmp / "codex_last_message.json"
        verdict = _codex_call(prompt, json.dumps(batch, ensure_ascii=False),
                              schema, last_message)

        self.assertEqual(verdict["uid"], batch["uid"])
        self.assertEqual(verdict["verifiedBy"], "codex-gpt-5.5-xhigh",
            f"codex didn't fill placeholder correctly: {verdict.get('verifiedBy')!r}")
        self.assertIn(verdict["finalAnswer"]["key"], ("a", "b", "c", "d", "e"))
        self.assertIn(verdict["finalAnswer"]["confidence"], ("low", "medium", "high"))

        type(self).codex_verdict = verdict
        print(f"  codex verdict: key={verdict['finalAnswer']['key']} "
              f"confidence={verdict['finalAnswer']['confidence']} "
              f"verifiedBy={verdict['verifiedBy']!r}")

    # --- Stage 5: cross-model consensus ----------------------------------

    def test_05_models_consensus_or_dispute(self) -> None:
        """Trivial sanity: log whether Opus and codex agreed. The pipeline
        treats disagreement as a quarantine signal — we just report which.
        """
        if self.opus_verdict is None or self.codex_verdict is None:
            self.skipTest("need both opus + codex verdicts")
        opus_key = self.opus_verdict["finalAnswer"]["key"]
        codex_key = self.codex_verdict["finalAnswer"]["key"]
        if opus_key == codex_key:
            print(f"  CONSENSUS: both models picked {opus_key!r}")
        else:
            print(f"  DISPUTE: opus={opus_key!r}, codex={codex_key!r} — would quarantine")
        # No assertion — both outcomes are valid pipeline states.

    @unittest.skipUnless(HAS_CODEX, "codex CLI not on PATH")
    def test_02b_enrich_via_codex(self) -> None:
        """ENRICH_PROMPT.md must be model-agnostic. The pipeline normally runs
        Opus for enrichment, but a robust prompt should also work with codex.
        This test smokes that: feed the same question + ENRICH_PROMPT.md to
        codex and check the output has the structurally-required fields.

        We use a relaxed shape check (just the must-haves) because codex's
        Ukrainian text generation may differ stylistically from Opus and
        autofix.py wasn't invoked here. The point is: codex CAN drive this
        prompt to produce schema-valid output, not that it produces an
        Opus-identical result.
        """
        if self.question is None:
            self.skipTest("no source question (stage 2 should have loaded it)")

        enrich_prompt = (SKILL_RESOURCES / "ENRICH_PROMPT.md").read_text()
        # Reuse the same shape codex uses for reverify (sandbox + ephemeral)
        # but without --output-schema since ENRICH_PROMPT doesn't have one.
        # codex exec writes the final message to a file via --output-last-message.
        last_message = self.tmp / "codex_enrich_last_message.json"
        res = subprocess.run(
            ["codex", "exec",
             "--sandbox", "read-only",
             "--skip-git-repo-check",
             "--ephemeral",
             "--color", "never",
             "--output-last-message", str(last_message),
             enrich_prompt],
            input=json.dumps(self.question, ensure_ascii=False),
            capture_output=True,
            text=True,
            timeout=600,
        )
        if res.returncode != 0:
            self.fail(f"codex enrich exited {res.returncode}\nstderr: {res.stderr[:400]}")
        if not last_message.exists() or last_message.stat().st_size == 0:
            self.fail(f"codex enrich produced empty output\nstderr: {res.stderr[:400]}")

        # codex may fence the JSON; reuse our extractor
        enriched_by_codex = _extract_balanced_json(last_message.read_text())

        # Must-have fields (the same checks test_02a applies to opus output)
        for k in ("id", "number", "options", "answers", "correctAnswer",
                 "correctAnswerKey", "correctAnswerText",
                 "validation", "hintCandidates", "hintChoice", "hint"):
            self.assertIn(k, enriched_by_codex,
                f"codex enrichment missing key {k!r}")
        self.assertEqual(len(enriched_by_codex["hintCandidates"]), 5,
            "codex didn't produce 5 hint candidates")
        self.assertEqual(len(enriched_by_codex["answers"][0]["whyCandidates"]), 5,
            "codex didn't produce 5 whyCandidates per option")

        print(f"  codex enrich: clinicalAgreement="
              f"{enriched_by_codex['validation']['clinicalAgreement']} "
              f"confidence={enriched_by_codex['validation']['confidence']}")

    @unittest.skipUnless(HAS_CODEX, "codex CLI not on PATH")
    def test_03b_topic_classify_via_codex(self) -> None:
        """Topic classification must also work with codex. The pipeline normally
        invokes Opus via topic_classify.py, but the prompt is built dynamically
        from the taxonomy + question stems and shouldn't be model-specific.

        We re-use topic_classify's prompt builders (`taxonomy_from_reference`,
        `build_prompt`, `build_input`, `extract_json`) but call codex instead
        of claude, then verify the response shape and that the returned topic +
        clinicalTopic are within the taxonomy's allowed values.
        """
        if self.enriched is None:
            self.skipTest("stage 2 didn't produce an enriched question")

        # Import topic_classify's prompt helpers
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "topic_classify_for_codex", SKILL_SCRIPTS / "topic_classify.py")
        topic_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(topic_mod)

        # Build taxonomy + prompt from the real krok-file-8 source
        reference = IMPORTS_DIR / "krok-file-8.json"
        topics, clinicals = topic_mod.taxonomy_from_reference(reference)
        prompt = topic_mod.build_prompt(topics, clinicals)
        # Single-question fake enriched block (build_input expects this shape)
        fake_block = {"blocks": [{"questions": [self.enriched]}]}
        user_input = (f"Класифікуй це 1 питання:\n\n"
                      + topic_mod.build_input(fake_block))

        # Codex doesn't have a schema for topic_classify (the script is ad-hoc).
        # Use --output-last-message to capture the assistant's text reply.
        last_message = self.tmp / "codex_topic_last.json"
        res = subprocess.run(
            ["codex", "exec",
             "--sandbox", "read-only",
             "--skip-git-repo-check",
             "--ephemeral",
             "--color", "never",
             "--output-last-message", str(last_message),
             prompt],
            input=user_input,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if res.returncode != 0:
            self.fail(f"codex topic exited {res.returncode}\nstderr: {res.stderr[:400]}")
        if not last_message.exists() or last_message.stat().st_size == 0:
            self.fail("codex topic produced empty output")

        raw = last_message.read_text()
        out = topic_mod.extract_json(raw)
        results = out.get("results", [])
        self.assertEqual(len(results), 1,
            f"codex returned {len(results)} classifications, expected 1")

        r = results[0]
        self.assertEqual(r["number"], self.enriched["number"])
        self.assertIn(r["topic"], set(topics),
            f"codex picked topic {r['topic']!r} not in taxonomy")
        self.assertIn(r["clinicalTopic"], set(clinicals),
            f"codex picked clinicalTopic {r['clinicalTopic']!r} not in taxonomy")

        print(f"  codex topic: {r['topic']!r}, clinicalTopic: {r['clinicalTopic']!r}")


if __name__ == "__main__":
    unittest.main()
