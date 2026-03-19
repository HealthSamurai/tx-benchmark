#!/usr/bin/env bun
// resource-snapshot.ts --server <server> --label <label> --run <run-id>
//
// Records a timestamped resource snapshot by querying Prometheus and Docker.
// Used to capture idle footprint before the benchmark starts.
// Under-load metrics are captured continuously by cAdvisor/node_exporter.
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
  },
});

const { server, label, run } = values;
if (!server || !label) {
  console.error('Usage: resource-snapshot.ts --server <server> --label <label> [--run <run-id>]');
  process.exit(1);
}

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

const [cpuUsage, containers] = await Promise.all([
  queryProm(cpuQuery),
  getContainers(),
]);

// Memory: sum RSS across all containers (parallel)
const memResults = await Promise.all(
  containers.map(cname =>
    $`docker stats --no-stream --format {{.MemUsage}} ${cname}`.text().catch(() => '')
  )
);
const memBytes = memResults.reduce((sum, usage) =>
  sum + parseDockerMem(usage.trim().split(/\s+/)[0] ?? ''), 0);
const memUsedBytes = memBytes > 0 ? memBytes : null;

// Data volume: sum du -sb for named volume mounts
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
const dataVolumeBytes = dataBytes > 0 ? dataBytes : null;

// ── Output ──────────────────────────────────────────────────────────────────

const snapshot = {
  server,
  label,
  timestamp:         new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  cpu_usage:         cpuUsage,
  mem_used_bytes:    memUsedBytes,
  data_volume_bytes: dataVolumeBytes,
};

const outDir  = `results/${run}/${server}`;
const outFile = `${outDir}/snapshot_${label}.json`;
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + '\n');

console.log(`Snapshot saved: ${outFile}`);
console.log(JSON.stringify(snapshot, null, 2));
