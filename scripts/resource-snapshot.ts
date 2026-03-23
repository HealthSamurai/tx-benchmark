#!/usr/bin/env bun
// resource-snapshot.ts --server <server> --label <label> --run <run-id> [--since <iso-timestamp>]
//
// Records a timestamped resource snapshot by querying Prometheus and Docker.
// Used to capture idle footprint before the benchmark starts.
// Under-load metrics are captured continuously by cAdvisor/node_exporter.
//
// With --since <iso-timestamp>: captures peak memory over the window [since, now]
// by querying Prometheus max_over_time instead of docker stats.
//
// Output: results/{run}/{server}/snapshot_{label}.json

import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { $ } from 'bun';
import { queryProm } from './lib/prometheus.ts';

const { values } = parseArgs({
  options: {
    server: { type: 'string' },
    label:  { type: 'string' },
    run:    { type: 'string', default: 'unknown' },
    since:  { type: 'string' },  // ISO timestamp — enables peak mode
  },
});

const { server, label, run, since } = values;
if (!server || !label) {
  console.error('Usage: resource-snapshot.ts --server <server> --label <label> [--run <run-id>] [--since <iso>]');
  process.exit(1);
}

const peakMode = !!since;

// ── Docker helpers ──────────────────────────────────────────────────────────

function parseDockerMem(usage: string): number {
  const m = usage.match(/^([\d.]+)(GiB|MiB|KiB|B)/);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  switch (m[2]) {
    case 'GiB': return Math.round(val * 1073741824);
    case 'MiB': return Math.round(val * 1048576);
    case 'KiB': return Math.round(val * 1024);
    default:    return Math.round(val);
  }
}

async function getContainers(): Promise<string[]> {
  const out = await $`docker ps --filter label=com.docker.compose.project=${server} --format {{.Names}}`.text();
  return out.trim().split('\n').filter(Boolean);
}

// ── Measurements ────────────────────────────────────────────────────────────

const cpuQuery = `sum(rate(container_cpu_usage_seconds_total{container_label_com_docker_compose_project="${server}"}[1m])) / scalar(count(node_cpu_seconds_total{mode="idle"})) * 100`;

const memPromQuery = `sum(container_memory_usage_bytes{container_label_com_docker_compose_project="${server}"})`;

let cpuUsage: number | null   = null;
let memUsedBytes: number | null = null;
let peakMemBytes: number | null = null;

if (peakMode) {
  // Peak mode: query max_over_time since the given timestamp
  const elapsedSec = Math.ceil((Date.now() - new Date(since!).getTime()) / 1000);
  const peakQuery  = `max_over_time((${memPromQuery})[${elapsedSec}s:5s])`;
  peakMemBytes = await queryProm(peakQuery);
} else {
  const containers = await getContainers();

  [cpuUsage] = await Promise.all([queryProm(cpuQuery)]);

  // Memory: sum RSS across all containers (parallel)
  const memResults = await Promise.all(
    containers.map(cname =>
      $`docker stats --no-stream --format {{.MemUsage}} ${cname}`.text().catch(() => '')
    )
  );
  const memBytes = memResults.reduce((sum, usage) =>
    sum + parseDockerMem(usage.trim().split(/\s+/)[0] ?? ''), 0);
  memUsedBytes = memBytes > 0 ? memBytes : null;
}

// Data volume: sum du -sb for named volume mounts (idle mode only)
let dataVolumeBytes: number | null = null;
if (!peakMode) {
  const containers = await getContainers();
  const volumeFmt = '{{range .Mounts}}{{if eq .Type "volume"}}{{.Destination}}\n{{end}}{{end}}';
  let dataBytes = 0;
  for (const cname of containers) {
    const mounts = await $`docker inspect ${cname} --format ${volumeFmt}`.text().catch(() => '');
    for (const mpath of mounts.trim().split('\n').filter(Boolean)) {
      const du = await $`docker exec ${cname} du -sb ${mpath}`.text().catch(() => '');
      const n = parseInt(du.trim().split(/\s+/)[0] ?? '0', 10);
      if (!isNaN(n)) dataBytes += n;
    }
  }
  dataVolumeBytes = dataBytes > 0 ? dataBytes : null;
}

// ── Output ──────────────────────────────────────────────────────────────────

const snapshot = {
  server,
  label,
  timestamp:         new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  cpu_usage:         cpuUsage,
  mem_used_bytes:    memUsedBytes,
  data_volume_bytes: dataVolumeBytes,
  ...(peakMode ? { peak_mem_bytes: peakMemBytes } : {}),
};

const outDir  = `results/${run}/${server}`;
const outFile = `${outDir}/snapshot_${label}.json`;
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + '\n');

console.log(`Snapshot saved: ${outFile}`);
console.log(JSON.stringify(snapshot, null, 2));
