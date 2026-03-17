#!/usr/bin/env bash
# run.sh <server> <base-url> [run-id] [resume-from]
#
# Runs the full benchmark for one server:
#   1. Preflight  — correctness checks, outputs results/{run}/{server}/preflight.json
#   2. Snapshot   — idle resource footprint
#   3. Warmup     — JIT + connection pool warm-up, results discarded
#   4. Benchmark  — for each passing test: VUs=1, 10, 50 (test-outer order)
#   5. Push       — summary metrics to Prometheus Pushgateway
#
# run-id tags all results for this run (default: current datetime).
# Use the same run-id across all servers to group them into one benchmark run.
#
# resume-from resumes a previously aborted run starting at TEST_ID or TEST_ID/VUS.
# The resume point is printed automatically when a server crash is detected.
#
# Example:
#   RUN=2026-03-15T14:00
#   ./scripts/run.sh termbox    http://localhost:7001/fhir $RUN
#   ./scripts/run.sh ontoserver https://tx.example.com/fhir $RUN
#   ./scripts/run.sh termbox    http://localhost:7001/fhir $RUN EX03/10
#
# Dependencies: k6, jq

set -euo pipefail

SERVER="${1:?Usage: run.sh <server> <base-url> [run-id] [resume-from]}"
BASE_URL="${2:?Usage: run.sh <server> <base-url> [run-id] [resume-from]}"
RUN_ID="${3:-$(date +%Y-%m-%dT%H:%M)}"
RESUME_FROM="${4:-}"

PROM_URL="http://localhost:9090/api/v1/write"
VU_LEVELS=(1 10 50)
DURATION="${DURATION:-30s}"
WARMUP_VUS=10
WARMUP_DURATION="5s"
INTER_TEST_SLEEP=5   # seconds between tests to let the server recover

# ─── Parse resume point ───────────────────────────────────────────────────

RESUME_TEST=""
RESUME_VUS=""
if [[ -n "$RESUME_FROM" ]]; then
  RESUME_TEST="${RESUME_FROM%%/*}"
  RESUME_VUS="${RESUME_FROM##*/}"
  [[ "$RESUME_VUS" == "$RESUME_TEST" ]] && RESUME_VUS=""  # no slash → no VUS specified
  echo "Resuming from test=${RESUME_TEST}${RESUME_VUS:+, vus=${RESUME_VUS}}"
fi

# ─── Check dependencies ───────────────────────────────────────────────────

if ! curl -sf --max-time 3 "http://localhost:9090/-/healthy" > /dev/null 2>&1; then
  echo "ERROR: Prometheus is not reachable at localhost:9090."
  echo "Start the observability stack first: cd observability && docker compose up -d"
  exit 1
fi

# ─── Test registry ────────────────────────────────────────────────────────
# Add entries here as new tests are defined.
TESTS=(
  k6/FS/FS01.js
  k6/LK/LK01.js
  k6/LK/LK02.js
  k6/LK/LK03.js
  k6/LK/LK04.js
  k6/LK/LK05.js
  k6/VC/VC01.js
  k6/VC/VC02.js
  k6/VC/VC03.js
  k6/EX/EX01.js
  k6/EX/EX02.js
  k6/EX/EX03.js
  k6/EX/EX04.js
  k6/EX/EX05.js
  k6/EX/EX06.js
  k6/EX/EX07.js
  k6/EX/EX08.js
  k6/SS/SS01.js
  k6/CM/CM01.js
  k6/CM/CM02.js
)

# ─── Helpers ──────────────────────────────────────────────────────────────

header() { echo; echo "=== $* ==="; echo; }

passed() {
  jq -e --arg id "$1" '.tests[$id].status == "pass"' \
    "results/${RUN_ID}/${SERVER}/preflight.json" > /dev/null 2>&1
}

check_server() {
  local test_id="$1" vus="$2"
  if ! curl -sf --max-time 5 "${BASE_URL}/metadata" > /dev/null 2>&1; then
    echo
    echo "ERROR: ${SERVER} is not responding after ${test_id}/vus${vus}."
    echo "Restart the server, then resume with:"
    echo "  ./scripts/run.sh ${SERVER} ${BASE_URL} ${RUN_ID} ${test_id}/${vus}"
    exit 1
  fi
}

# ─── Skip-until logic for resume ──────────────────────────────────────────
# Returns 0 (skip) or 1 (run) for the given test_id + vus.

resuming=false
[[ -n "$RESUME_TEST" ]] && resuming=true

should_skip() {
  local test_id="$1" vus="$2"
  $resuming || return 1   # not resuming → never skip

  if [[ "$test_id" == "$RESUME_TEST" ]]; then
    if [[ -z "$RESUME_VUS" || "$vus" == "$RESUME_VUS" ]]; then
      resuming=false        # reached the resume point — stop skipping
      return 1
    fi
    return 0               # same test, earlier VUS → skip
  fi
  return 0                 # earlier test → skip
}

# ─── 1. Preflight ─────────────────────────────────────────────────────────

if [[ -z "$RESUME_FROM" ]]; then
  header "1/4 Preflight: $SERVER"

  mkdir -p "results/${RUN_ID}/${SERVER}"

  k6 run \
    --env BASE_URL="$BASE_URL" \
    --env SERVER_NAME="$SERVER" \
    --env RUN_ID="$RUN_ID" \
    preflight/run.js

  PASSING=$(jq -r '[.tests | to_entries[] | select(.value.status == "pass") | .key] | join(", ")' \
    "results/${RUN_ID}/${SERVER}/preflight.json")

  if [ -z "$PASSING" ]; then
    echo "No tests passed preflight. Aborting."
    exit 1
  fi

  echo "Passing: $PASSING"

  # ─── 2. Idle snapshot ───────────────────────────────────────────────────

  header "2/4 Idle resource snapshot: $SERVER"
  ./scripts/resource-snapshot.sh "$SERVER" idle "$RUN_ID"

  # ─── 3. Warmup ──────────────────────────────────────────────────────────

  header "3/4 Warmup: $SERVER ($WARMUP_VUS VUs, $WARMUP_DURATION)"

  k6 run \
    --vus "$WARMUP_VUS" \
    --duration "$WARMUP_DURATION" \
    --env BASE_URL="$BASE_URL" \
    k6/warmup.js
else
  echo "Skipping preflight/snapshot/warmup (resuming from ${RESUME_FROM})"
fi

# ─── 4. Benchmark ─────────────────────────────────────────────────────────

header "4/4 Benchmark: $SERVER"

mkdir -p "results/${RUN_ID}/${SERVER}/benchmark"

first_test=true
for TEST in "${TESTS[@]}"; do
  TEST_ID=$(basename "$TEST" .js)

  if ! passed "$TEST_ID"; then
    echo "  ~ $TEST_ID — skipped (not supported)"
    continue
  fi

  $first_test || sleep "$INTER_TEST_SLEEP"
  first_test=false

  echo "--- $TEST_ID ---"

  for VUS in "${VU_LEVELS[@]}"; do
    if should_skip "$TEST_ID" "$VUS"; then
      echo "  ~ vus${VUS} — skipped (resuming)"
      continue
    fi

    echo "  → vus${VUS}"
    K6_PROMETHEUS_RW_SERVER_URL="$PROM_URL" \
    k6 run \
      --out experimental-prometheus-rw \
      --vus "$VUS" \
      --duration "$DURATION" \
      --tag server="$SERVER" \
      --tag test="$TEST_ID" \
      --tag vus="$VUS" \
      --tag run="$RUN_ID" \
      --env BASE_URL="$BASE_URL" \
      --env SERVER_NAME="$SERVER" \
      --env TEST_ID="$TEST_ID" \
      --env VUS="$VUS" \
      --env RUN_ID="$RUN_ID" \
      "$TEST"

    check_server "$TEST_ID" "$VUS"
  done
done

header "Done: $SERVER"

# ─── 5. Push results ──────────────────────────────────────────────────────

header "5/5 Pushing results to Pushgateway"
./scripts/push-results.sh
