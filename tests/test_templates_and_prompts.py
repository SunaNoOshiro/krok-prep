"""Validate that schema templates + real data shapes agree, and that prompt
files have the expected structural elements.

This catches "schema drift" — when merge.py starts emitting a new field but
the template file isn't updated, or when a prompt loses a critical section.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from tests._helpers import IMPORTS_DIR, REVERIFY_DIR, SKILL_RESOURCES

EXTRACT_TEMPLATE = SKILL_RESOURCES / "krok-question-block.v1.template.json"
DOUBTS_TEMPLATE = SKILL_RESOURCES / "krok-question-doubts.v1.template.json"


class TemplatesAreValidJsonTest(unittest.TestCase):
    def test_extract_template_parses(self) -> None:
        data = json.loads(EXTRACT_TEMPLATE.read_text())
        self.assertEqual(data["schemaVersion"], "krok-question-block.v1")
        self.assertIn("blocks", data)
        self.assertGreater(len(data["blocks"][0]["questions"]), 0)

    def test_doubts_template_parses(self) -> None:
        data = json.loads(DOUBTS_TEMPLATE.read_text())
        self.assertEqual(data["schemaVersion"], "krok-question-doubts.v1")
        self.assertIn("summary", data)
        self.assertIn("items", data)


class TemplatesMatchRealDataTest(unittest.TestCase):
    """When new fields are added to merge.py output, the template must keep up."""

    def test_doubts_template_keys_match_published_doubts(self) -> None:
        template = json.loads(DOUBTS_TEMPLATE.read_text())
        # Pick any real doubts file as the source of truth
        real_paths = sorted(IMPORTS_DIR.glob("krok-file-*-doubts.json"))
        self.assertGreater(len(real_paths), 0, "no doubts file to validate against")
        real = json.loads(real_paths[0].read_text())

        template_top = set(template.keys()) - {"$schema_note"}
        real_top = set(real.keys())
        self.assertEqual(template_top, real_top,
            f"template top-level keys drifted from real (diff: {template_top ^ real_top})")

        template_summary = set(template["summary"].keys())
        real_summary = set(real["summary"].keys())
        self.assertEqual(template_summary, real_summary,
            f"summary keys drifted (diff: {template_summary ^ real_summary})")

        # First template item must have every key the real items use
        template_item_keys = set(template["items"][0].keys())
        real_item_keys: set[str] = set()
        for item in real["items"]:
            real_item_keys |= set(item.keys())
        self.assertTrue(real_item_keys.issubset(template_item_keys),
            f"real doubts items have keys missing from template: "
            f"{real_item_keys - template_item_keys}")

    def test_extract_template_is_subset_of_enriched(self) -> None:
        """Extract output is the PRE-enrichment shape, so all its keys must
        appear in the enriched (post-stage-8) data. Enriched adds more keys."""
        template = json.loads(EXTRACT_TEMPLATE.read_text())
        real_enriched = sorted(IMPORTS_DIR.glob("krok-file-*.enriched.json"))
        self.assertGreater(len(real_enriched), 0)
        real = json.loads(real_enriched[0].read_text())

        # Required top-level keys from extract must appear in enriched
        template_top = set(template.keys()) - {"$schema_note"}
        real_top = set(real.keys())
        missing = template_top - real_top
        self.assertEqual(missing, set(),
            f"extract template keys absent from enriched: {missing}")

        # First-question keys from extract should subset enriched
        t_keys = set(template["blocks"][0]["questions"][0].keys())
        r_keys = set(real["blocks"][0]["questions"][0].keys())
        missing = t_keys - r_keys
        self.assertEqual(missing, set(),
            f"extract template question keys absent from enriched: {missing}")


class PromptsHaveRequiredSectionsTest(unittest.TestCase):
    """Light structural lint of the prompt files — catches accidental gutting."""

    def _read(self, path: Path) -> str:
        self.assertTrue(path.exists(), f"missing prompt: {path}")
        text = path.read_text()
        self.assertGreater(len(text), 500, f"{path} suspiciously short ({len(text)}B)")
        return text

    def test_extract_prompt_has_schema_and_self_check(self) -> None:
        text = self._read(SKILL_RESOURCES / "EXTRACT_PROMPT.md")
        self.assertIn("krok-question-block.v1", text)
        self.assertIn("BLOCK_ID", text)
        self.assertIn("correctAnswer", text)
        self.assertRegex(text, r"###?\s+Output", "expected an Output section")
        self.assertRegex(text, r"###?\s+Self-check", "expected a Self-check section")

    def test_enrich_prompt_describes_candidates_and_choice(self) -> None:
        text = self._read(SKILL_RESOURCES / "ENRICH_PROMPT.md")
        self.assertIn("hintCandidates", text)
        self.assertIn("whyCandidates", text)
        self.assertIn("hintChoice", text)
        self.assertIn("whyChoice", text)
        self.assertIn("validation", text)

    def test_reverify_prompt_has_uid_finalanswer_bestwhys(self) -> None:
        text = self._read(REVERIFY_DIR / "REVERIFY_PROMPT.md")
        self.assertIn("uid", text)
        self.assertIn("finalAnswer", text)
        self.assertIn("bestWhys", text)
        self.assertIn("bestHint", text)


class JsonExamplesInPromptsParseTest(unittest.TestCase):
    """Each fenced ```json``` block in a prompt should be valid JSON5-ish
    (or at least parse after stripping comments + trailing commas).
    """

    def _extract_json_blocks(self, text: str) -> list[str]:
        blocks = []
        pattern = re.compile(r"```jsonc?\s*\n(.*?)\n```", re.DOTALL)
        for m in pattern.finditer(text):
            blocks.append(m.group(1))
        return blocks

    def _try_parse_relaxed(self, src: str) -> None:
        # Strip // line comments
        src = re.sub(r"//[^\n]*", "", src)
        # Strip /* */ block comments
        src = re.sub(r"/\*.*?\*/", "", src, flags=re.DOTALL)
        # Strip trailing commas
        src = re.sub(r",(\s*[\]}])", r"\1", src)
        json.loads(src)

    def _try_parse_template_aware(self, src: str) -> None:
        """Some prompt examples use placeholder text like `<verbatim text>`
        which isn't valid JSON. Allow these only when wrapped in quotes."""
        # Replace `<...>` placeholder values inside string positions with a
        # safe placeholder. Anything UNQUOTED `<x>` is a problem.
        # Quick check: replace `<placeholder>` between quotes with safe text.
        src = re.sub(r'"<[^>]+>"', '"PLACEHOLDER"', src)
        # Unquoted angle-bracket scalars (e.g. `"count": <integer>`)
        src = re.sub(r":\s*<[^>]+>", ': "PLACEHOLDER"', src)
        self._try_parse_relaxed(src)

    def test_extract_prompt_json_blocks_parse(self) -> None:
        text = (SKILL_RESOURCES / "EXTRACT_PROMPT.md").read_text()
        blocks = self._extract_json_blocks(text)
        self.assertGreater(len(blocks), 0, "extract prompt has no JSON examples")
        for i, b in enumerate(blocks):
            with self.subTest(block=i):
                self._try_parse_template_aware(b)


if __name__ == "__main__":
    unittest.main()
