#!/usr/bin/env bash
# resource-snapshot.sh <server> <label>
#
# Records a timestamped resource snapshot by querying Prometheus.
# Used to capture idle footprint before the benchmark starts.
# Under-load metrics are captured continuously by cAdvisor/node_exporter.
#
# Output: results/snapshots/{server}_{label}.json

set -euo pipefail

SERVER="${1:?Usage: resource-snapshot.sh <server> <label>}"
LABEL="${2:?Usage: resource-snapshot.sh <server> <label>}"
PROM="http://localhost:9090"
OUT="results/snapshots/${SERVER}_${LABEL}.json"

mkdir -p results/snapshots

query() {
  local q
  q=$(jq -rn --arg v "$1" '$v | @uri')
  curl -sg "${PROM}/api/v1/query?query=${q}" \
    | jq -r '.data.result[0].value[1] // "N/A"'
}

CPU_IDLE=$(query    'avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100')
MEM_TOTAL=$(query   'node_memory_MemTotal_bytes / 1024 / 1024')
MEM_AVAIL=$(query   'node_memory_MemAvailable_bytes / 1024 / 1024')
DISK_USED=$(query   'sum(node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"} - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"}) / 1024 / 1024 / 1024')

to_num() { [[ "$1" == "N/A" ]] && echo "null" || echo "$1"; }

jq -n \
  --arg server    "$SERVER" \
  --arg label     "$LABEL" \
  --arg ts        "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --argjson cpu       "$(to_num "$CPU_IDLE")" \
  --argjson mem_total "$(to_num "$MEM_TOTAL")" \
  --argjson mem_avail "$(to_num "$MEM_AVAIL")" \
  --argjson disk      "$(to_num "$DISK_USED")" \
  '{
    server:           $server,
    label:            $label,
    timestamp:        $ts,
    cpu_idle_pct:     $cpu,
    mem_total_mb:     $mem_total,
    mem_available_mb: $mem_avail,
    disk_used_gb:     $disk
  }' > "$OUT"

echo "Snapshot saved: $OUT"
cat "$OUT"
