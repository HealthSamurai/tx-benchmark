#!/usr/bin/env bash
# push-results.sh
#
# Reads all benchmark result JSONs under results/ and pushes summary metrics
# to the Prometheus Pushgateway as gauges.
#
# Each file results/{server}/benchmark/{TEST}_vus{N}.json becomes a group:
#   /metrics/job/benchmark/server/{server}/test/{TEST}/vus/{N}
#
# Metrics pushed (all gauge):
#   benchmark_duration_p50_ms
#   benchmark_duration_p95_ms
#   benchmark_duration_p99_ms
#   benchmark_duration_avg_ms
#   benchmark_duration_min_ms
#   benchmark_duration_max_ms
#   benchmark_throughput_rps
#   benchmark_error_rate
#
# Usage:
#   ./scripts/push-results.sh [pushgateway-url]
#   Defaults to http://localhost:9091

set -euo pipefail

PUSH_URL="${1:-http://localhost:9091}"

if ! curl -sf --max-time 3 "${PUSH_URL}/-/healthy" > /dev/null 2>&1; then
  echo "ERROR: Pushgateway not reachable at ${PUSH_URL}"
  echo "Start the observability stack: cd observability && docker compose up -d"
  exit 1
fi

pushed=0
skipped=0

for file in results/*/benchmark/*.json; do
  [[ -f "$file" ]] || continue

  server=$(jq -r '.server'  "$file")
  test=$(jq -r   '.test'    "$file")
  vus=$(jq -r    '.vus'     "$file")

  p50=$(jq -r        '.duration.p50 // "NaN"' "$file")
  p95=$(jq -r        '.duration.p95 // "NaN"' "$file")
  p99=$(jq -r        '.duration.p99 // "NaN"' "$file")
  avg=$(jq -r        '.duration.avg // "NaN"' "$file")
  min=$(jq -r        '.duration.min // "NaN"' "$file")
  max=$(jq -r        '.duration.max // "NaN"' "$file")
  throughput=$(jq -r '.throughput   // "NaN"' "$file")
  error_rate=$(jq -r '.error_rate   // "NaN"' "$file")

  if [[ "$p50" == "NaN" || "$p50" == "null" ]]; then
    echo "  ~ ${server}/${test}/vus${vus} — skipped (no duration data)"
    ((skipped++)) || true
    continue
  fi

  url="${PUSH_URL}/metrics/job/benchmark/server/${server}/test/${test}/vus/${vus}"

  payload=$(cat <<EOF
# TYPE benchmark_duration_p50_ms gauge
benchmark_duration_p50_ms $p50
# TYPE benchmark_duration_p95_ms gauge
benchmark_duration_p95_ms $p95
# TYPE benchmark_duration_p99_ms gauge
benchmark_duration_p99_ms $p99
# TYPE benchmark_duration_avg_ms gauge
benchmark_duration_avg_ms $avg
# TYPE benchmark_duration_min_ms gauge
benchmark_duration_min_ms $min
# TYPE benchmark_duration_max_ms gauge
benchmark_duration_max_ms $max
# TYPE benchmark_throughput_rps gauge
benchmark_throughput_rps $throughput
# TYPE benchmark_error_rate gauge
benchmark_error_rate $error_rate
EOF
)

  printf '%s\n' "$payload" | curl -sf -X PUT "$url" --data-binary @- > /dev/null
  echo "  ✓ ${server}/${test}/vus${vus}"
  ((pushed++)) || true
done

echo
echo "Done. Pushed: ${pushed}, skipped: ${skipped}"
