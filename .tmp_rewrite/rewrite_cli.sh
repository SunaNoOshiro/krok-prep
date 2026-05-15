#!/bin/bash
# Rewrite flagged hints using CLI (Opus 4.7)
# Usage: ./rewrite_cli.sh

cd "$(dirname "$0")"

PROMPT=$(cat HINT_REWRITE_PROMPT.md)
RESULTS=hint_rewrite_results
mkdir -p "$RESULTS"

echo "Rewriting flagged hints using CLI..."
echo "Using: claude -p --system-prompt (Opus 4.7)"
echo ""

batch_count=$(ls hint_rewrite_batches/rewrite_batch_*.json 2>/dev/null | wc -l)
echo "Found $batch_count batches"
echo ""

for batch_file in hint_rewrite_batches/rewrite_batch_*.json; do
    bname=$(basename "$batch_file")
    bnum=$(echo "$bname" | sed 's/.*_batch_//;s/\.json//')

    if [ -f "$RESULTS/$bname" ]; then
        echo "Batch $bnum: (already done)"
        continue
    fi

    echo -n "Batch $bnum: "

    batch_json=$(cat "$batch_file")
    temp_msg="/tmp/claude_rewrite_$bnum.txt"
    echo "Rewrite hints in this batch:

$batch_json" > "$temp_msg"

    output=$(claude -p --system-prompt "$PROMPT" < "$temp_msg" 2>/dev/null)
    json=$(echo "$output" | sed -n '/{/,/^}/p')

    if [ -n "$json" ]; then
        echo "$json" > "$RESULTS/$bname"
        echo "✓"
    else
        echo "✗ (no JSON)"
    fi

    rm -f "$temp_msg"
done

echo ""
echo "Results saved to $RESULTS/"
echo "Files created: $(ls $RESULTS/*.json 2>/dev/null | wc -l)"
