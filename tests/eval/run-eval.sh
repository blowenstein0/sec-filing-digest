#!/usr/bin/env bash
set -euo pipefail

# Run the promptfoo eval suite against the dev server or production.
# Usage:
#   ./run-eval.sh              # local dev server on port 3001
#   ./run-eval.sh prod         # production at sec-v2.zipperdatabrief.com
#   ./run-eval.sh <url>        # custom URL

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ "${1:-}" = "prod" ]; then
  export EVAL_BASE_URL="https://sec-v2.zipperdatabrief.com"
elif [ -n "${1:-}" ]; then
  export EVAL_BASE_URL="$1"
else
  export EVAL_BASE_URL="http://localhost:3001"
fi

export METRICS_TABLE="${METRICS_TABLE:-sec-financial-metrics}"

echo "Running eval against: $EVAL_BASE_URL"
echo "Metrics table: $METRICS_TABLE"
echo ""

npx promptfoo eval --no-cache "$@"

echo ""
echo "View results: npx promptfoo view"
