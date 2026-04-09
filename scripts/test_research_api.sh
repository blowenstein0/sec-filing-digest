#!/bin/bash
# Quick smoke tests for the research API against the dev server.
# Usage: ./scripts/test_research_api.sh [port]
# Requires: dev server running (npm run dev -- -p PORT)

PORT=${1:-3001}
BASE="http://localhost:$PORT"
PASS=0
FAIL=0

test_query() {
  local name="$1"
  local query="$2"
  local check="$3"

  echo -n "  $name... "
  RESULT=$(curl -s -N -X POST "$BASE/api/research/query" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$query\"}" \
    --max-time 120 2>&1 | grep '"type":"answer"' | sed 's/^data: //')

  if [ -z "$RESULT" ]; then
    echo "FAIL (no answer event)"
    FAIL=$((FAIL + 1))
    return
  fi

  CONTENT=$(echo "$RESULT" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['content'][:100])" 2>/dev/null)
  SOURCES=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read())['sources']))" 2>/dev/null)

  if echo "$CONTENT" | grep -qi "$check"; then
    echo "PASS ($SOURCES sources, ${#CONTENT}+ chars)"
    PASS=$((PASS + 1))
  else
    echo "FAIL (missing '$check' in response)"
    echo "    Got: $CONTENT"
    FAIL=$((FAIL + 1))
  fi
}

echo "Research API smoke tests ($BASE)"
echo "================================"

echo ""
echo "Single company queries:"
test_query "AAPL risk factors" "What are AAPL main risk factors?" "apple"
test_query "AMZN financials" "Show me AMZN revenue and net income" "amazon"
test_query "BLK overview" "Give me an overview of BLK" "blackrock"

echo ""
echo "Comparison queries:"
test_query "AAPL vs AMZN" "Compare AAPL vs AMZN on revenue" "revenue"

echo ""
echo "Edge cases:"
test_query "Unknown ticker" "What are ZZZZ risk factors?" "not found"

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
