#!/usr/bin/env bun
// push-results.ts [--push-url <url>] [--run <run-id>]
//
// Reads all benchmark result JSONs and preflight JSONs under results/{run}/{server}/
// and pushes summary metrics to the Prometheus Pushgateway as gauges.
//
// Benchmark groups — job/benchmark/run/{run}/server/{server}/test/{test}/vus/{N}:
//   benchmark_duration_p50_ms, _p95_ms, _p99_ms, _avg_ms, _min_ms, _max_ms
//   benchmark_throughput_rps
//   benchmark_error_rate
//
// Imputation groups — job/benchmark_imputed/run/{run}/server/{server}/test/{test}/vus/{N}:
//   benchmark_throughput_rps_imputed
//   Pushed for (server, test, vus) where the server did not participate.
//   Value = pN of [0, ...participant_eff_rps] — 0 anchors the floor so that
//   servers with fewer participants receive proportionally lower imputed values.
//   N is configured via IMPUTE_PERCENTILE in scripts/lib/constants.ts.
//
// Preflight groups — job/preflight/run/{run}/server/{server}/test/{test}:
//   benchmark_preflight   1=pass  0=fail  -1=skip
//
// Snapshot groups — job/snapshot/run/{run}/server/{server}:
//   benchmark_idle_cpu_pct
//   benchmark_idle_mem_used_bytes
//   benchmark_idle_data_volume_bytes
//
// Score groups — job/score/run/{run}/server/{server}:
//   benchmark_score   composite score 0–100 (top server = 100)
//
// Weighted RPS groups — job/weighted_rps/run/{run}/server/{server}/test/{test}:
//   benchmark_weighted_rps   max_eff_rps × LK01-normalizing-weight × bias
//
// Usage:
//   bun scripts/push-results.ts [--push-url http://localhost:9091] [--run <run-id>]
//   If --run is omitted, pushes all runs found under results/

import { parseArgs } from 'node:util';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { checkPushgateway, pushMetrics } from './lib/pushgateway.ts';
import { PUSH_URL, IMPUTE_PERCENTILE } from './lib/constants.ts';
import type { BenchmarkResult, PreflightResult, Snapshot } from './lib/types.ts';
import { buildRawRps, computeScores } from './lib/scoring.ts';

const { values } = parseArgs({
  options: {
    'push-url': { type: 'string', default: PUSH_URL },
    'run':      { type: 'string' },
  },
});

const pushUrl   = values['push-url']!;
const filterRun = values['run'];

await checkPushgateway(pushUrl);

// ── Discover result files ───────────────────────────────────────────────────

function getRuns(): string[] {
  return readdirSync('results', { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(r => !filterRun || r === filterRun);
}

function getServers(run: string): string[] {
  const dir = `results/${run}`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; }
  catch { return null; }
}

// ── 1. Benchmark results ────────────────────────────────────────────────────

console.log('\nPushing benchmark results…');

// Collect effective RPS rows for Prometheus imputation push and scoring
type RunEffRow = { run: string; server: string; test: string; vus: string; effRps: number };
const effRows: RunEffRow[] = [];

let pushed = 0;
let skipped = 0;

for (const run of getRuns()) {
  for (const server of getServers(run)) {
    const benchDir = `results/${run}/${server}/benchmark`;
    if (!existsSync(benchDir)) continue;

    for (const file of readdirSync(benchDir).filter(f => f.endsWith('.json'))) {
      const result = readJson<BenchmarkResult>(`${benchDir}/${file}`);
      if (!result) continue;

      const { test, vus, throughput, error_rate, duration } = result;

      if (duration?.p50 == null) {
        console.log(`  ~ ${server}/${test}/vus${vus} — skipped (no duration data)`);
        skipped++;
        continue;
      }

      await pushMetrics(
        { job: 'benchmark', run, server, test, vus: String(vus) },
        [
          { name: 'benchmark_duration_p50_ms', value: duration.p50 },
          { name: 'benchmark_duration_p95_ms', value: duration.p95 },
          { name: 'benchmark_duration_p99_ms', value: duration.p99 },
          { name: 'benchmark_duration_avg_ms', value: duration.avg },
          { name: 'benchmark_duration_min_ms', value: duration.min },
          { name: 'benchmark_duration_max_ms', value: duration.max },
          { name: 'benchmark_throughput_rps',  value: throughput },
          { name: 'benchmark_error_rate',      value: error_rate },
        ],
        pushUrl,
      );

      console.log(`  ✓ ${server}/${test}/vus${vus}`);
      pushed++;

      effRows.push({ run, test, vus: String(vus), server, effRps: throughput * (1 - error_rate) });
    }
  }
}

console.log(`\nBenchmark: pushed ${pushed}, skipped ${skipped}`);

// ── 2. Preflight results ────────────────────────────────────────────────────

console.log('\nPushing preflight results…');
pushed = 0;

const statusValue: Record<string, number> = { pass: 1, fail: 0, skip: -1 };

for (const run of getRuns()) {
  for (const server of getServers(run)) {
    const preflight = readJson<PreflightResult>(`results/${run}/${server}/preflight.json`);
    if (!preflight) continue;

    for (const [test, { status }] of Object.entries(preflight.tests)) {
      const value = statusValue[status];
      if (value == null) continue;

      await pushMetrics(
        { job: 'preflight', run, server, test },
        [{ name: 'benchmark_preflight', value }],
        pushUrl,
      );
      console.log(`  ✓ ${server}/${test} → ${status}`);
      pushed++;
    }
  }
}

console.log(`\nPreflight: pushed ${pushed}`);

// ── 3. Idle snapshots ───────────────────────────────────────────────────────

console.log('\nPushing idle snapshots…');
pushed = 0;

for (const run of getRuns()) {
  for (const server of getServers(run)) {
    const snap     = readJson<Snapshot>(`results/${run}/${server}/snapshot_idle.json`);
    const snapPeak = readJson<Snapshot>(`results/${run}/${server}/snapshot_peak.json`);
    if (!snap && !snapPeak) continue;

    if (snap) {
      await pushMetrics(
        { job: 'snapshot', run, server },
        [
          { name: 'benchmark_idle_cpu_pct',          value: snap.cpu_usage         ?? 'NaN' },
          { name: 'benchmark_idle_mem_used_bytes',    value: snap.mem_used_bytes    ?? 'NaN' },
          { name: 'benchmark_idle_data_volume_bytes', value: snap.data_volume_bytes ?? 'NaN' },
        ],
        pushUrl,
      );
      console.log(`  ✓ ${server} (idle snapshot)`);
    }

    if (snapPeak) {
      await pushMetrics(
        { job: 'snapshot', run, server },
        [
          { name: 'benchmark_peak_mem_bytes', value: snapPeak.peak_mem_bytes ?? 'NaN' },
        ],
        pushUrl,
      );
      console.log(`  ✓ ${server} (peak snapshot)`);
    }

    pushed++;
  }
}

console.log(`\nSnapshots: pushed ${pushed}`);

// ── 4. Imputation ───────────────────────────────────────────────────────────

// Imputed value = pN of [0, ...sorted_participant_eff_rps].
// Prepending 0 anchors the distribution at zero, so that non-participants
// always receive less than the worst real participant, with the discount
// increasing as fewer servers participate in a test.

console.log(`\nComputing p${IMPUTE_PERCENTILE} imputation for missing (server, test, vus) combinations…`);

function percentile(sorted: number[], pct: number): number {
  const n   = sorted.length;
  if (n === 1) return sorted[0];
  const pos = (pct / 100) * (n - 1);
  const lo  = Math.floor(pos);
  const hi  = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Group by (run, test, vus)
const groups    = new Map<string, RunEffRow[]>();
const runServers = new Map<string, Set<string>>();

for (const row of effRows) {
  const key = `${row.run}|${row.test}|${row.vus}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(row);

  if (!runServers.has(row.run)) runServers.set(row.run, new Set());
  runServers.get(row.run)!.add(row.server);
}

let imputed = 0;
const imputedRows: RunEffRow[] = [];

for (const [key, participants] of groups) {
  const [run, test, vus] = key.split('|');
  const allServers    = [...runServers.get(run)!];
  const participating = new Set(participants.map(r => r.server));
  const vals          = [0, ...participants.map(r => r.effRps).sort((a, b) => a - b)];
  const imputedVal    = percentile(vals, IMPUTE_PERCENTILE);

  for (const server of allServers) {
    if (participating.has(server)) continue;

    await pushMetrics(
      { job: 'benchmark_imputed', run, server, test, vus },
      [{ name: 'benchmark_throughput_rps_imputed', value: imputedVal.toFixed(6) }],
      pushUrl,
    );
    console.log(`  ~ ${server}/${test}/vus${vus} → imputed ${imputedVal.toFixed(2)} (p${IMPUTE_PERCENTILE} of ${vals.length - 1} servers)`);
    imputedRows.push({ run, test, vus, server, effRps: imputedVal });
    imputed++;
  }
}

console.log(`\nImputation: pushed ${imputed}`);

// ── 5. Composite score + weighted RPS ────────────────────────────────────────

console.log('\nComputing composite scores and weighted RPS…');

const runs = [...new Set(effRows.map(r => r.run))];
let scored = 0;
let weightedPushed = 0;

for (const run of runs) {
  const runRows   = effRows.filter(r => r.run === run);
  const servers   = [...new Set(runRows.map(r => r.server))];
  const tests     = [...new Set(runRows.map(r => r.test))];

  const rawRps = buildRawRps(runRows);

  const { scores, wRps } = computeScores(servers, tests, rawRps, IMPUTE_PERCENTILE);

  for (const [server, score] of scores) {
    await pushMetrics(
      { job: 'score', run, server },
      [{ name: 'benchmark_score', value: score.toFixed(4) }],
      pushUrl,
    );
    console.log(`  ✓ ${server} → ${score.toFixed(2)}`);
    scored++;
  }

  for (const [key, value] of wRps) {
    const [server, test] = key.split('|');
    await pushMetrics(
      { job: 'weighted_rps', run, server, test },
      [{ name: 'benchmark_weighted_rps', value: value.toFixed(4) }],
      pushUrl,
    );
    weightedPushed++;
  }
}

console.log(`\nScores: pushed ${scored}`);
console.log(`Weighted RPS: pushed ${weightedPushed}`);
