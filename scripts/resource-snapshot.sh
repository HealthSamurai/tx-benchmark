#!/usr/bin/env bash
# resource-snapshot.sh <server> <label>
#
# Records a timestamped resource snapshot by querying Prometheus.
# Used to capture idle footprint before the benchmark starts.
# Under-load metrics are captured continuously by cAdvisor/node_exporter.
#
# Output: results/{run}/{server}/snapshot_{label}.json

set -euo pipefail

SERVER="${1:?Usage: resource-snapshot.sh <server> <label>}"
LABEL="${2:?Usage: resource-snapshot.sh <server> <label>}"
RUN_ID="${3:-unknown}"
PROM="http://localhost:9090"
OUT="results/${RUN_ID}/${SERVER}/snapshot_${LABEL}.json"

mkdir -p "results/${RUN_ID}/${SERVER}"

query() {
  local q
  q=$(jq -rn --arg v "$1" '$v | @uri')
  curl -sg "${PROM}/api/v1/query?query=${q}" \
    | jq -r '.data.result[0].value[1] // "N/A"'
}

CPU_USAGE=$(query   "sum(rate(container_cpu_usage_seconds_total{container_label_com_docker_compose_project=\"${SERVER}\"}[1m])) / scalar(count(node_cpu_seconds_total{mode=\"idle\"})) * 100")
DISK_USED=$(query   'sum(node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"} - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"}) / 1024 / 1024 / 1024')

# Container memory: sum RSS across all containers in the server's compose project
MEM_USED_BYTES=null
mem_bytes=0
while IFS= read -r cname; do
  usage=$(docker stats --no-stream --format '{{.MemUsage}}' "$cname" 2>/dev/null | awk '{print $1}')
  # Parse value with unit (GiB/MiB/KiB/B)
  bytes=$(echo "$usage" | awk '
    /GiB/ { gsub(/GiB/,""); printf "%.0f", $1 * 1073741824; next }
    /MiB/ { gsub(/MiB/,""); printf "%.0f", $1 * 1048576;    next }
    /KiB/ { gsub(/KiB/,""); printf "%.0f", $1 * 1024;       next }
    /B/   { gsub(/B/,"");   printf "%.0f", $1;              next }
  ')
  [[ -n "$bytes" ]] && mem_bytes=$((mem_bytes + bytes))
done < <(docker ps --filter "label=com.docker.compose.project=${SERVER}" --format '{{.Names}}')
[[ "$mem_bytes" -gt 0 ]] && MEM_USED_BYTES=$mem_bytes

# Data volume size: auto-discovered from containers in the server's compose project.
# Finds all running containers labelled com.docker.compose.project=$SERVER,
# inspects each for named volume mounts, and sums du -sb across all of them.
DATA_BYTES=0
while IFS= read -r cname; do
  while IFS= read -r mpath; do
    bytes=$(docker exec "$cname" du -sb "$mpath" 2>/dev/null | awk '{print $1}')
    [[ -n "$bytes" ]] && DATA_BYTES=$((DATA_BYTES + bytes))
  done < <(docker inspect "$cname" \
    --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Destination}}{{"\n"}}{{end}}{{end}}' \
    | grep -v '^$')
done < <(docker ps --filter "label=com.docker.compose.project=${SERVER}" --format '{{.Names}}')
[[ "$DATA_BYTES" -eq 0 ]] && DATA_BYTES="null"

to_num() { [[ "$1" == "N/A" ]] && echo "null" || echo "$1"; }

jq -n \
  --arg server    "$SERVER" \
  --arg label     "$LABEL" \
  --arg ts        "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --argjson cpu        "$(to_num "$CPU_USAGE")" \
  --argjson mem_used   "$(to_num "$MEM_USED_BYTES")" \
  --argjson disk       "$(to_num "$DISK_USED")" \
  --argjson data_bytes "$DATA_BYTES" \
  '{
    server:            $server,
    label:             $label,
    timestamp:         $ts,
    cpu_usage:         $cpu,
    mem_used_bytes:    $mem_used,
    disk_used_gb:      $disk,
    data_volume_bytes: $data_bytes
  }' > "$OUT"

echo "Snapshot saved: $OUT"
cat "$OUT"
