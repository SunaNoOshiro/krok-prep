# KROK/EDKI Prep

Interactive learning platform for Physical Therapy students preparing for the KROK/EDKI exam.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Run the app: `npm run dev`
3. Run tests: `npm test` (TypeScript typecheck + Python unittest)

## Tests

Located in [tests/](tests/). Two tiers:

### Offline (default — runs in `npm test`, free + fast)
LLM calls are mocked via `subprocess.run` patching.
- [tests/test_skill_pipeline.py](tests/test_skill_pipeline.py) — end-to-end skill pipeline (split → autofix → validate → merge) against `krok-file-1.json` as fixture.
- [tests/test_one_batch_full_flow.py](tests/test_one_batch_full_flow.py) — one question through enrich + topic_classify + reverification with mocked Opus/codex responses.
- [tests/test_templates_and_prompts.py](tests/test_templates_and_prompts.py) — schema templates match real data shape; prompts contain required sections.

### Live (opt-in — real CLI calls via subscriptions, ~3-8 min)
[tests/test_live_one_question.py](tests/test_live_one_question.py) runs ONE real question through stages 2-6 with actual `claude -p` (Opus 4.7 via Claude subscription) and `codex exec` (GPT-5 xhigh via ChatGPT subscription) calls. No per-call API charges — just time + rate-limit consumption.

Stage 1 (PDF extraction) is **always skipped** in this test — PDF attachments aren't a clean fit for `claude -p` stdin. The SKILL.md flow is: drop the PDF into claude.ai web, save the returned JSON to `src/data/imports/<BLOCK_ID>.json`, then run downstream stages. This test covers everything downstream.

```bash
RUN_LIVE_LLM_TESTS=1 python3 -m unittest tests.test_live_one_question -v
```

Requires `claude` and `codex` CLIs on `$PATH`. Defaults to `krok-file-1.json` as the fixture; override with `TEST_BLOCK_ID=krok-file-N`.

Run just the Python tests: `python3 -m unittest discover -s tests -v`.
