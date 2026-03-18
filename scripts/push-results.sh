#!/usr/bin/env bash
# push-results.sh
#
# Reads all benchmark result JSONs and preflight JSONs under results/{run}/{server}/ and
# pushes summary metrics to the Prometheus Pushgateway as gauges.
#
# Benchmark groups — /metrics/job/benchmark/run/{run}/server/{server}/test/{TEST}/vus/{N}:
#   benchmark_duration_p50_ms, _p95_ms, _p99_ms, _avg_ms, _min_ms, _max_ms
#   benchmark_throughput_rps
#   benchmark_error_rate
#
# Imputation groups — /metrics/job/benchmark_imputed/run/{run}/server/{server}/test/{TEST}/vus/{N}:
#   benchmark_throughput_rps_imputed
#   Pushed for (server, test, vus) combinations where the server did not participate.
#   Value = Nth percentile of participating servers' effective RPS (throughput × (1 − error_rate)).
#   Configurable via IMPUTE_PERCENTILE env var (default: 20).
#
# Preflight groups — /metrics/job/preflight/run/{run}/server/{server}/test/{TEST}:
#   benchmark_preflight   1=pass  0=fail  -1=skip
#
# Usage:
#   ./scripts/push-results.sh [pushgateway-url]
#   Defaults to http://localhost:9091

set -euo pipefail

PUSH_URL="${1:-http://localhost:9091}"
IMPUTE_PERCENTILE="${IMPUTE_PERCENTILE:-50}"

if ! curl -sf --max-time 3 "${PUSH_URL}/-/healthy" > /dev/null 2>&1; then
  echo "ERROR: Pushgateway not reachable at ${PUSH_URL}"
  echo "Start the observability stack: cd observability && docker compose up -d"
  exit 1
fi

pushed=0
skipped=0

# Temp file collects "run\ttest\tvus\tserver\teff_rps" rows for imputation
eff_tsv=$(mktemp)
trap 'rm -f "$eff_tsv"' EXIT

for file in results/*/*/benchmark/*.json; do
  [[ -f "$file" ]] || continue

  server=$(jq -r '.server'  "$file")
  test=$(jq -r   '.test'    "$file")
  vus=$(jq -r    '.vus'     "$file")
  run=$(jq -r    '.run // "unknown"' "$file")

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

  url="${PUSH_URL}/metrics/job/benchmark/run/${run}/server/${server}/test/${test}/vus/${vus}"

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

  # Collect row for imputation
  eff=$(awk "BEGIN{printf \"%.6f\", $throughput * (1 - $error_rate)}")
  printf '%s\t%s\t%s\t%s\t%s\n' "$run" "$test" "$vus" "$server" "$eff" >> "$eff_tsv"
done

echo
echo "Benchmark: pushed ${pushed}, skipped ${skipped}"

# ── Preflight pass/fail matrix ────────────────────────────────────────────

echo
echo "Pushing preflight results…"
pushed=0

for file in results/*/*/preflight.json; do
  [[ -f "$file" ]] || continue

  server=$(jq -r '.server'        "$file")
  run=$(jq -r    '.run // "unknown"' "$file")

  while IFS= read -r test; do
    status=$(jq -r --arg t "$test" '.tests[$t].status' "$file")
    case "$status" in
      pass) value=1  ;;
      fail) value=0  ;;
      skip) value=-1 ;;
      *)    continue  ;;
    esac

    url="${PUSH_URL}/metrics/job/preflight/run/${run}/server/${server}/test/${test}"
    printf '# TYPE benchmark_preflight gauge\nbenchmark_preflight %s\n' "$value" | \
      curl -sf -X PUT "$url" --data-binary @- > /dev/null
    echo "  ✓ ${server}/${test} → ${status}"
    ((pushed++)) || true
  done < <(jq -r '.tests | keys[]' "$file")
done

echo
echo "Preflight: pushed ${pushed}"

# ── Idle resource snapshots ───────────────────────────────────────────────

echo
echo "Pushing idle snapshots…"
pushed=0

for file in results/*/*/snapshot_idle.json; do
  [[ -f "$file" ]] || continue

  server=$(jq -r '.server' "$file")
  run=$(echo "$file" | awk -F/ '{print $2}')
  cpu=$(jq -r  '.cpu_usage         // "NaN"' "$file")
  mem=$(jq -r  '.mem_used_mb       // "NaN"' "$file")
  disk=$(jq -r '.disk_used_gb      // "NaN"' "$file")
  data=$(jq -r '.data_volume_bytes // "NaN"' "$file")

  url="${PUSH_URL}/metrics/job/snapshot/run/${run}/server/${server}"
  payload=$(cat <<EOF
# TYPE benchmark_idle_cpu_pct gauge
benchmark_idle_cpu_pct $cpu
# TYPE benchmark_idle_mem_used_mb gauge
benchmark_idle_mem_used_mb $mem
# TYPE benchmark_idle_disk_used_gb gauge
benchmark_idle_disk_used_gb $disk
# TYPE benchmark_idle_data_volume_bytes gauge
benchmark_idle_data_volume_bytes $data
EOF
)
  printf '%s\n' "$payload" | curl -sf -X PUT "$url" --data-binary @- > /dev/null
  echo "  ✓ ${server} (idle snapshot)"
  ((pushed++)) || true
done

echo
echo "Snapshots: pushed ${pushed}"

# ── Percentile imputation for non-participating (server, test, vus) ───────

echo
echo "Computing p${IMPUTE_PERCENTILE} imputation for missing (server, test, vus) combinations…"
imputed=0

# node reads the TSV, computes pN per (run,test,vus), outputs rows for missing servers:
# "run\ttest\tvus\tserver\timputed_val\tn_participants"
while IFS=$'\t' read -r irun itest ivus srv imputed_val n_part; do
  url="${PUSH_URL}/metrics/job/benchmark_imputed/run/${irun}/server/${srv}/test/${itest}/vus/${ivus}"
  printf '# TYPE benchmark_throughput_rps_imputed gauge\nbenchmark_throughput_rps_imputed %s\n' "$imputed_val" | \
    curl -sf -X PUT "$url" --data-binary @- > /dev/null
  echo "  ~ ${srv}/${itest}/vus${ivus} → imputed ${imputed_val} (p${IMPUTE_PERCENTILE} of ${n_part} servers)"
  ((imputed++)) || true
done < <(node -e "
const fs = require('fs');
const pct = parseInt(process.env.IMPUTE_PERCENTILE || '20', 10);
const rows = fs.readFileSync('$eff_tsv', 'utf8').trim().split('\n').filter(Boolean)
  .map(l => { const [run,test,vus,server,eff] = l.split('\t'); return {run,test,vus,server,eff:+eff}; });

// Group by (run,test,vus)
const groups = {};
const runServers = {};
for (const r of rows) {
  const key = r.run+'|'+r.test+'|'+r.vus;
  (groups[key] = groups[key] || []).push(r);
  (runServers[r.run] = runServers[r.run] || new Set()).add(r.server);
}

for (const [key, participants] of Object.entries(groups)) {
  const [run, test, vus] = key.split('|');
  const allServers = [...runServers[run]];
  const participating = new Set(participants.map(r => r.server));

  const vals = participants.map(r => r.eff).sort((a,b) => a-b);
  const n = vals.length;
  // Linear interpolation percentile: p0=min, p100=max, smooth gradation between
  const pos = (pct / 100) * (n - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  const imputed = (vals[lo] + (vals[hi] - vals[lo]) * (pos - lo)).toFixed(6);

  for (const srv of allServers) {
    if (!participating.has(srv)) {
      process.stdout.write(run+'\t'+test+'\t'+vus+'\t'+srv+'\t'+imputed+'\t'+n+'\n');
    }
  }
}
")

echo
echo "Imputation: pushed ${imputed}"
