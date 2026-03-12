#!/usr/bin/env bash
# run.sh <server> <base-url>
#
# Runs the full benchmark for one server:
#   1. Preflight  — correctness checks, outputs preflight/results/{server}.json
#   2. Snapshot   — idle resource footprint
#   3. Warmup     — JIT + connection pool warm-up, results discarded
#   4. Benchmark  — measurement at VUs=1, 10, 50 for each passing test
#
# Example:
#   ./scripts/run.sh termbox http://localhost:7001/fhir
#
# Dependencies: k6, jq

set -euo pipefail

SERVER="${1:?Usage: run.sh <server> <base-url>}"
BASE_URL="${2:?Usage: run.sh <server> <base-url>}"

PROM_URL="http://localhost:9090/api/v1/write"
VU_LEVELS=(1 10 50)
DURATION="60s"
WARMUP_VUS=10
WARMUP_DURATION="30s"

# ─── Test registry ────────────────────────────────────────────────────────
# Add entries here as new tests are defined.
TESTS=(
  k6/LK/LK01.js
)

# ─── Helpers ──────────────────────────────────────────────────────────────

header() { echo; echo "=== $* ==="; echo; }

passed() {
  jq -e --arg id "$1" '.tests[$id].status == "pass"' \
    "results/${SERVER}/preflight.json" > /dev/null 2>&1
}

# ─── 1. Preflight ─────────────────────────────────────────────────────────

header "1/4 Preflight: $SERVER"

k6 run \
  --env BASE_URL="$BASE_URL" \
  --env SERVER_NAME="$SERVER" \
  preflight/run.js

PASSING=$(jq -r '[.tests | to_entries[] | select(.value.status == "pass") | .key] | join(", ")' \
  "results/${SERVER}/preflight.json")

if [ -z "$PASSING" ]; then
  echo "No tests passed preflight. Aborting."
  exit 1
fi

echo "Passing: $PASSING"

# ─── 2. Idle snapshot ─────────────────────────────────────────────────────

header "2/4 Idle resource snapshot: $SERVER"
./scripts/resource-snapshot.sh "$SERVER" idle

# ─── 3. Warmup ────────────────────────────────────────────────────────────

header "3/4 Warmup: $SERVER ($WARMUP_VUS VUs, $WARMUP_DURATION)"

k6 run \
  --vus "$WARMUP_VUS" \
  --duration "$WARMUP_DURATION" \
  --env BASE_URL="$BASE_URL" \
  k6/warmup.js

# ─── 4. Benchmark ─────────────────────────────────────────────────────────

header "4/4 Benchmark: $SERVER"

for VUS in "${VU_LEVELS[@]}"; do
  echo "--- VUs=$VUS ---"
  for TEST in "${TESTS[@]}"; do
    TEST_ID=$(basename "$TEST" .js)

    if ! passed "$TEST_ID"; then
      echo "  ~ $TEST_ID — skipped (not supported)"
      continue
    fi

    echo "  → $TEST_ID"
    mkdir -p "results/${SERVER}/benchmark"
    K6_PROMETHEUS_RW_SERVER_URL="$PROM_URL" \
    k6 run \
      --out experimental-prometheus-rw \
      --vus "$VUS" \
      --duration "$DURATION" \
      --tag server="$SERVER" \
      --tag test="$TEST_ID" \
      --tag vus="$VUS" \
      --env BASE_URL="$BASE_URL" \
      --env SERVER_NAME="$SERVER" \
      --env TEST_ID="$TEST_ID" \
      --env VUS="$VUS" \
      "$TEST"
  done
done

header "Done: $SERVER"
