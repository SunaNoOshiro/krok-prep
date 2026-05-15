#!/bin/bash
# Best-of selection: pick best hint variant for each hint via CLI

cd /Users/suna_no_oshiro/Documents/fun-gpt/krok-prep/.tmp_rewrite

PROMPT=$(cat HINT_BEST_OF_PROMPT.md)
RESULTS=hint_best_of_results
mkdir -p "$RESULTS"

batch_count=$(ls hint_best_of_batches/best_of_batch_*.json 2>/dev/null | wc -l)
echo "Best-of selection: $batch_count batches"
echo ""

for batch_file in hint_best_of_batches/best_of_batch_*.json; do
    bname=$(basename "$batch_file")
    bnum=$(echo "$bname" | sed 's/.*_batch_//;s/\.json//')

    # Skip if already done
    if [ -f "$RESULTS/$bname" ]; then
        echo "Batch $bnum: (already done)"
        continue
    fi

    echo -n "Batch $bnum: "

    batch_json=$(cat "$batch_file")
    temp_msg="/tmp/claude_bestof_$bnum.txt"
    echo "Select the best hint variant for each:

$batch_json" > "$temp_msg"

    output=$(claude -p --system-prompt "$PROMPT" < "$temp_msg" 2>/dev/null)
    json=$(echo "$output" | sed -n '/{/,/^}/p')

    if [ -n "$json" ]; then
        echo "$json" > "$RESULTS/$bname"
        echo "✓"
    else
        echo "✗"
    fi

    rm -f "$temp_msg"
done

echo ""
echo "Files created: $(ls $RESULTS/*.json 2>/dev/null | wc -l)/$batch_count"
