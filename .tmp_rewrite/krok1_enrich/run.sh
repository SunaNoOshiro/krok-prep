#!/bin/bash
# Validate + enrich each krok-file-1 question via Opus 4.7 CLI.
# Mirrors the .tmp_rewrite/validate_cli.sh pattern (skip-if-done) but adds
# parallel fan-out via xargs -P JOBS.
#
# Usage:
#   ./run.sh [start_qnum] [end_qnum] [jobs]
# Defaults: start=1, end=149, jobs=1 (sequential).
#
# Example: ./run.sh 2 149 4   # process q002–q149 with 4 concurrent calls.

set -u
cd "$(dirname "$0")"

PROMPT_FILE="PROMPT.md"
BATCHES=batches
RESULTS=results
LOGS=logs
START=${1:-1}
END=${2:-149}
JOBS=${3:-1}

mkdir -p "$RESULTS" "$LOGS"

# Per-question worker. Called by xargs with a 3-digit question number as $1.
process_one() {
    local n="$1"
    local batch="$BATCHES/q$n.json"
    local out="$RESULTS/q$n.json"
    local log="$LOGS/q$n.log"
    local raw_dump="$LOGS/q$n.raw.txt"

    if [ ! -f "$batch" ]; then
        echo "q$n: MISSING batch file"
        return
    fi

    if [ -f "$out" ] && [ -s "$out" ]; then
        echo "q$n: (skip — already done)"
        return
    fi

    local t0; t0=$(date +%s)

    local prompt; prompt=$(cat "$PROMPT_FILE")

    # Stream the question on stdin; system prompt holds the instructions.
    # --print = one-shot non-interactive.
    local raw
    raw=$(cat "$batch" | claude -p --model claude-opus-4-7 \
                                    --system-prompt "$prompt" \
                                    --output-format text 2>"$log")

    # Extract first balanced top-level JSON object (handles fence-wrapping).
    local json
    json=$(printf '%s' "$raw" | python3 -c '
import sys, json, re
s = sys.stdin.read().strip()
s = re.sub(r"^```(?:json)?\s*", "", s)
s = re.sub(r"\s*```$", "", s)
# strip JSON5-style trailing commas before } or ] — claude sometimes emits these
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
        echo "q$n: OK (${dt}s)"
    else
        printf '%s' "$raw" > "$raw_dump"
        echo "q$n: FAIL (${dt}s) — see $log + $raw_dump"
    fi
}

export -f process_one
export PROMPT_FILE BATCHES RESULTS LOGS

echo "==> processing q$(printf '%03d' "$START")–q$(printf '%03d' "$END") with JOBS=$JOBS"
echo

# Generate the q### list and feed to xargs.
seq -f "%03g" "$START" "$END" | \
    xargs -n 1 -P "$JOBS" -I {} bash -c 'process_one "$@"' _ {}

echo
echo "==> summary"
echo "  batches:  $(ls "$BATCHES"/q*.json 2>/dev/null | wc -l | tr -d ' ')"
echo "  results:  $(ls "$RESULTS"/q*.json 2>/dev/null | wc -l | tr -d ' ')"
echo "  fail log dumps: $(ls "$LOGS"/q*.raw.txt 2>/dev/null | wc -l | tr -d ' ')"
