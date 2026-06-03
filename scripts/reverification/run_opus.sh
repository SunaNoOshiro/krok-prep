#!/bin/bash
# Re-verify uncertain/disputed Krok questions via Opus 4.8 max (claude CLI).
# Same parallel-CLI pattern as `.claude/skills/krok-pdf-enrich/scripts/run.sh`
# (skip-if-done + xargs -P + trailing-comma-tolerant JSON extractor), but
# iterates over arbitrary uid'd batch files instead of a fixed q### range.
#
# Usage (run from inside scripts/reverification/):
#   ./run_opus.sh                    # all batches, JOBS=3
#   ./run_opus.sh <uid_pattern>      # filter to matching uids (substring)
#   ./run_opus.sh <pattern> <jobs>
#
# Pre-requisite: python3 split_batches.py (creates batches/<uid>.json files).

set -u
cd "$(dirname "$0")"

PROMPT_FILE="REVERIFY_PROMPT.md"
BATCHES=batches
RESULTS=results
LOGS=logs

if [ ! -d "$BATCHES" ] || [ -z "$(ls "$BATCHES"/*.json 2>/dev/null)" ]; then
    echo "ERROR: $BATCHES/ is empty. Run: python3 split_batches.py" >&2
    exit 1
fi

PATTERN=${1:-}
JOBS=${2:-3}

mkdir -p "$RESULTS" "$LOGS"

process_one() {
    local batch="$1"
    local uid; uid=$(basename "$batch" .json)
    local out="$RESULTS/$uid.json"
    local log="$LOGS/$uid.log"
    local raw_dump="$LOGS/$uid.raw.txt"

    if [ -f "$out" ] && [ -s "$out" ]; then
        echo "$uid: (skip — already done)"
        return
    fi

    local t0; t0=$(date +%s)

    local prompt; prompt=$(sed 's/{{MODEL_IDENTIFIER}}/claude-opus-4-8/g' "$PROMPT_FILE")

    local raw
    raw=$(cat "$batch" | claude -p --model claude-opus-4-8 \
                                    --system-prompt "$prompt" \
                                    --output-format text 2>"$log")

    # Extract first balanced top-level JSON object (handles fence-wrapping
    # and JSON5-style trailing commas).
    local json
    json=$(printf '%s' "$raw" | python3 -c '
import sys, json, re
s = sys.stdin.read().strip()
s = re.sub(r"^```(?:json)?\s*", "", s)
s = re.sub(r"\s*```$", "", s)
s = re.sub(r",(\s*[\]}])", r"\1", s)
depth = 0; start = -1
for i, ch in enumerate(s):
    if ch == "{":
        if depth == 0: start = i
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth == 0 and start >= 0:
            chunk = s[start:i+1]
            try:
                json.loads(chunk)
                print(chunk); sys.exit(0)
            except Exception:
                start = -1
sys.exit(1)
' 2>>"$log")

    local dt=$(( $(date +%s) - t0 ))

    if [ -n "$json" ]; then
        printf '%s' "$json" > "$out"
        echo "$uid: OK (${dt}s)"
    else
        printf '%s' "$raw" > "$raw_dump"
        echo "$uid: FAIL (${dt}s) — see $log + $raw_dump"
    fi
}

export -f process_one
export PROMPT_FILE BATCHES RESULTS LOGS

# Collect matching batch files into a tempfile (portable to bash 3.x on macOS)
TARGETS_FILE=$(mktemp)
trap 'rm -f "$TARGETS_FILE"' EXIT

if [ -n "$PATTERN" ]; then
    ls "$BATCHES"/*.json | grep -- "$PATTERN" > "$TARGETS_FILE" || true
else
    ls "$BATCHES"/*.json > "$TARGETS_FILE"
fi

COUNT=$(wc -l < "$TARGETS_FILE" | tr -d ' ')
if [ "$COUNT" -eq 0 ]; then
    echo "No batches matched (pattern='$PATTERN')." >&2
    exit 1
fi

echo "==> processing $COUNT batch(es) with JOBS=$JOBS"
[ -n "$PATTERN" ] && echo "    filter: $PATTERN"
echo

xargs -n 1 -P "$JOBS" -I {} bash -c 'process_one "$@"' _ {} < "$TARGETS_FILE"

echo
echo "==> summary"
echo "  batches: $(ls "$BATCHES"/*.json 2>/dev/null | wc -l | tr -d ' ')"
echo "  results: $(ls "$RESULTS"/*.json 2>/dev/null | wc -l | tr -d ' ')"
echo "  fail log dumps: $(ls "$LOGS"/*.raw.txt 2>/dev/null | wc -l | tr -d ' ')"
