# Hint Quality Pipeline

CLI-based workflow to validate and improve quiz hints across all data sources.
Uses `claude -p --system-prompt` (Opus 4.7) — no API calls.

## Data Sources
- `src/data/edkiData.json` — 188 ЄДКІ questions
- `src/data/quizData.json` — 290 КРОК 2 questions
- `src/data/selfControlData.json` — 60 self-control questions
- `src/data/imports/krok-file-8.json` — 150 КРОК 8 questions

## Quick Workflow

### A. Standard validate → rewrite cycle (when hints have known issues)

```bash
cd .tmp_rewrite

# 1. Split all hints into 46 validation batches (15 hints each)
python3 hint_validate_split.py

# 2. Validate via CLI (~90 min for 688 hints)
chmod +x validate_cli.sh && ./validate_cli.sh

# 3. Aggregate results, identify flagged hints
python3 hint_validate_report.py
# Writes flagged.json

# 4. Split flagged into rewrite batches (20 hints each)
python3 hint_flagged_split.py

# 5. Rewrite flagged hints via CLI
chmod +x rewrite_cli.sh && ./rewrite_cli.sh

# 6. Merge rewrites into source JSONs (only updates flagged)
python3 hint_rewrite_merge.py
```

### B. Best-of selection (when you have multiple rewrite rounds)

If you have `hint_rewrite_*_results/` directories from previous runs, pick the
best hint per question across all variants:

```bash
# 1. Collect all hint variants + current hint per (source, id)
python3 collect_all_variants.py
# Writes all_variants.json

# 2. Split into best-of selection batches (10 hints each)
python3 split_best_of_batches.py

# 3. Run best-of selection via CLI (LLM picks best variant)
chmod +x best_of_cli.sh && ./best_of_cli.sh

# 4. Apply best variants to source data
python3 apply_best_of.py
```

## Key Files

### System Prompts
- `HINT_VALIDATE_PROMPT.md` — Validation criteria (ok/weak/broken verdicts)
- `HINT_REWRITE_PROMPT.md` — Rewrite guidelines (1-level abstraction rule)
- `HINT_BEST_OF_PROMPT.md` — Best-of selection prompt
- `HINT_STYLE_GUIDE.md` — General hint style guide
- `STYLE_GUIDE.md` — Broader style guide

### Pipeline Scripts
| Script | Purpose |
|--------|---------|
| `hint_validate_split.py` | Split 688 hints → validation batches |
| `validate_cli.sh` | Run CLI validation (sequential, ~90 min) |
| `hint_validate_report.py` | Aggregate validation, extract flagged |
| `hint_flagged_split.py` | Split flagged → rewrite batches |
| `rewrite_cli.sh` | Run CLI rewriting |
| `hint_rewrite_merge.py` | Merge rewrites into source data |
| `collect_all_variants.py` | Gather variants across rewrite rounds |
| `split_best_of_batches.py` | Split variants → selection batches |
| `best_of_cli.sh` | Pick best variant via CLI |
| `apply_best_of.py` | Apply selections to source data |

## Quality Criteria

A good hint must:
1. Provide **1 level of abstraction above the answer**
2. Name the framework/concept/classification
3. Ask one guiding question OR indicate key aspect
4. NOT give away the answer (even via synonyms)
5. NOT list options
6. NOT be factually wrong
7. NOT dump entire classifications
8. Be concise (1-2 sentences)

### Issue Categories (validation verdicts)
- **ok** — Good hint, follows all rules
- **weak** — Minor issues, still helpful
- **broken** — Serious problems (gives_away, lists_options, factually_wrong, etc.)

## Notes

### LLM Validation is Non-Deterministic
The same hint can get different verdicts on different runs. To handle this:
- Run validation multiple times if needed
- Use **best-of selection** to pick across multiple rewrite rounds (more robust)
- Don't chase "100%" forever — diminishing returns

### File Locations
All scripts use relative paths via `Path(__file__).resolve().parent`,
so they work whether you run from `.tmp_rewrite/` or the repo root.

### Re-running Batches
Validate/rewrite scripts skip already-done batches (check for result file),
so you can safely re-run them if interrupted.
