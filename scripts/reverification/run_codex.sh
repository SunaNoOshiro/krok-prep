#!/bin/bash
# Run independent verification through codex CLI (GPT-5.5 + xhigh reasoning,
# subscription auth). Mirrors run.sh in structure: per-uid batch -> single
# claude/codex call -> structured JSON written to disk.
#
# Output goes DIRECTLY to chatgpt-prompts/responses/<uid>.json (the same
# location user-pasted manual ChatGPT answers go), so build_disputed.py picks
# them up without changes. `verifiedBy` is set by the model itself via the
# schema-constrained output ("codex-gpt-5.5-xhigh").
#
# Usage (run from inside scripts/reverification/):
#   ./run_codex.sh                  # all batches, JOBS=2 (rate-limit safe)
#   ./run_codex.sh <uid_pattern>    # filter to matching uids (substring)
#   ./run_codex.sh <pattern> <jobs>
#
# Pre-requisite: python3 split_batches.py (creates batches/<uid>.json files).

set -u
cd "$(dirname "$0")"

PROMPT_FILE="PROMPT.md"
SCHEMA_FILE="codex-response.schema.json"
BATCHES=batches
RESPONSES=chatgpt-prompts/responses
LOGS=logs

if [ ! -d "$BATCHES" ] || [ -z "$(ls "$BATCHES"/*.json 2>/dev/null)" ]; then
    echo "ERROR: $BATCHES/ is empty. Run: python3 split_batches.py" >&2
    exit 1
fi
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "ERROR: $SCHEMA_FILE missing." >&2
    exit 1
fi

PATTERN=${1:-}
JOBS=${2:-2}

mkdir -p "$RESPONSES" "$LOGS"

# Detect whether a response file is still an empty stub (i.e. just nulls).
is_unfilled_stub() {
    local path="$1"
    [ ! -f "$path" ] && return 0
    [ ! -s "$path" ] && return 0
    python3 -c "
import json, sys
try:
    d = json.load(open('$path'))
except Exception:
    sys.exit(1)  # malformed → not a stub, leave alone
if any(d.get(k) for k in ('independentChoice','finalAnswer','perSourceVerdict')):
    sys.exit(1)
sys.exit(0)
"
}

process_one() {
    local batch="$1"
    local uid; uid=$(basename "$batch" .json)
    local out="$RESPONSES/$uid.json"
    local log="$LOGS/codex-$uid.log"
    local last="$LOGS/codex-$uid.last.txt"

    if ! is_unfilled_stub "$out"; then
        echo "$uid: (skip — already filled)"
        return
    fi

    local t0; t0=$(date +%s)

    local prompt; prompt=$(cat "$PROMPT_FILE")

    # codex exec:
    #   - stdin = batch JSON (appended as <stdin> block to the instructions)
    #   - prompt arg = system/instruction prompt (PROMPT.md)
    #   - --output-schema enforces the response shape
    #   - --output-last-message writes ONLY the final assistant turn (clean JSON)
    #   - --sandbox read-only blocks codex from executing shell commands
    #   - --ephemeral / --skip-git-repo-check avoid session persistence + git noise
    cat "$batch" | codex exec \
        --sandbox read-only \
        --skip-git-repo-check \
        --ephemeral \
        --color never \
        --output-schema "$SCHEMA_FILE" \
        --output-last-message "$last" \
        "$prompt" \
        > "$log" 2>&1

    local dt=$(( $(date +%s) - t0 ))

    # last-message file should now contain pure JSON. Validate before writing.
    if [ ! -s "$last" ]; then
        echo "$uid: FAIL (${dt}s) — empty output (see $log)"
        return
    fi

    if python3 -c "
import json, sys
try:
    d = json.load(open('$last'))
except Exception as e:
    print(f'JSON parse error: {e}', file=sys.stderr); sys.exit(1)
# Sanity: must have the key fields populated
if not (d.get('independentChoice') and d.get('finalAnswer') and d.get('perSourceVerdict')):
    print('missing required fields', file=sys.stderr); sys.exit(1)
# Stamp uid + always force verifiedBy (model copies the example from PROMPT.md)
d['uid'] = '$uid'
d['verifiedBy'] = 'codex-gpt-5.5-xhigh'
json.dump(d, open('$out','w'), ensure_ascii=False, indent=2)
"; then
        echo "$uid: OK (${dt}s)"
    else
        echo "$uid: FAIL (${dt}s) — invalid JSON (see $log + $last)"
    fi
}

export -f process_one is_unfilled_stub
export PROMPT_FILE SCHEMA_FILE BATCHES RESPONSES LOGS

# Collect matching batches → tempfile (bash 3.x portable)
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

echo "==> codex GPT-5.5 (xhigh) on $COUNT batch(es) with JOBS=$JOBS"
[ -n "$PATTERN" ] && echo "    filter: $PATTERN"
echo

xargs -n 1 -P "$JOBS" -I {} bash -c 'process_one "$@"' _ {} < "$TARGETS_FILE"

echo
echo "==> summary"
echo "  batches:   $(ls "$BATCHES"/*.json 2>/dev/null | wc -l | tr -d ' ')"
echo "  filled:    $(find "$RESPONSES" -name '*.json' -size +200c 2>/dev/null | wc -l | tr -d ' ')"
echo "  fail logs: $(ls "$LOGS"/codex-*.log 2>/dev/null | wc -l | tr -d ' ')"
