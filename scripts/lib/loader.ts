// loader.ts — reads raw result files for a run and returns a fully computed RunExport.
// Used by push-results.ts (Prometheus) and export-run.ts (website JSON).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { IMPUTE_PERCENTILE, VU_LEVELS, TEST_IDS } from './constants.ts';
import { BIAS } from '../../config/bias.ts';
import { computeScores, computeWeightedRps, type EffRow } from './scoring.ts';
import type { BenchmarkResult, PreflightResult, Snapshot, PreflightStatus } from './types.ts';

// ── Exported types ───────────────────────────────────────────────────────────

export interface BenchmarkPoint {
  rps:       number;
  p50:       number;
  p95:       number;
  p99:       number;
  avg:       number;
  min:       number;
  max:       number;
  errorRate: number;
}

export interface ServerData {
  id:          string;
  score:       number;
  rawScore:    number;
  snapshot: {
    cpuPct:    number | null;
    memBytes:  number | null;
    dataBytes: number | null;
  };
  preflight:   Record<string, PreflightStatus>;
  rawRps:      Record<string, number>;
  imputedRps:  Record<string, number>;
  weightedRps: Record<string, number>;
  benchmark:   Record<string, Record<string, BenchmarkPoint>>;
}

export interface RunExport {
  run:  string;
  date: string;
  config: {
    vus:              number[];
    tests:            string[];
    testDuration:     string;
    imputePercentile: number;
    bias:             Record<string, number>;
  };
  servers: ServerData[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; }
  catch { return null; }
}

function getServers(run: string): string[] {
  const dir = `results/${run}`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function percentile(sorted: number[], pct: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const pos = (pct / 100) * (n - 1);
  const lo  = Math.floor(pos);
  const hi  = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// ── Main loader ───────────────────────────────────────────────────────────────

export function loadRun(run: string, opts: { date?: string; testDuration?: string } = {}): RunExport {
  const servers = getServers(run);

  // 1. Read raw benchmark files → effRows + benchmark data per server
  const effRows: EffRow[] = [];
  const benchmarkData: Record<string, Record<string, Record<string, BenchmarkPoint>>> = {};
  const preflightData: Record<string, Record<string, PreflightStatus>> = {};
  const snapshotData:  Record<string, ServerData['snapshot']> = {};

  for (const server of servers) {
    benchmarkData[server] = {};

    const benchDir = `results/${run}/${server}/benchmark`;
    if (existsSync(benchDir)) {
      for (const file of readdirSync(benchDir).filter(f => f.endsWith('.json'))) {
        const r = readJson<BenchmarkResult>(`${benchDir}/${file}`);
        if (!r || r.duration?.p50 == null) continue;

        const vusKey = String(r.vus);
        if (!benchmarkData[server][r.test]) benchmarkData[server][r.test] = {};

        benchmarkData[server][r.test][vusKey] = {
          rps:       r.throughput,
          p50:       r.duration.p50,
          p95:       r.duration.p95,
          p99:       r.duration.p99,
          avg:       r.duration.avg,
          min:       r.duration.min,
          max:       r.duration.max,
          errorRate: r.error_rate,
        };

        effRows.push({
          server,
          test:   r.test,
          vus:    vusKey,
          effRps: r.throughput * (1 - r.error_rate),
        });
      }
    }

    // 2. Preflight
    const preflight = readJson<PreflightResult>(`results/${run}/${server}/preflight.json`);
    preflightData[server] = preflight
      ? Object.fromEntries(Object.entries(preflight.tests).map(([t, v]) => [t, v.status]))
      : {};

    // 3. Snapshots
    const snap = readJson<Snapshot>(`results/${run}/${server}/snapshot_idle.json`);
    snapshotData[server] = {
      cpuPct:    snap?.cpu_usage         ?? null,
      memBytes:  snap?.mem_used_bytes    ?? null,
      dataBytes: snap?.data_volume_bytes ?? null,
    };
  }

  // 4. Imputation
  const groups    = new Map<string, EffRow[]>();
  const runServers = new Set(effRows.map(r => r.server));

  for (const row of effRows) {
    const key = `${row.test}|${row.vus}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const imputedRows: EffRow[] = [];
  for (const [key, participants] of groups) {
    const [test, vus] = key.split('|');
    const participating = new Set(participants.map(r => r.server));
    const vals = [0, ...participants.map(r => r.effRps).sort((a, b) => a - b)];
    const imputedVal = percentile(vals, IMPUTE_PERCENTILE);

    for (const server of runServers) {
      if (participating.has(server)) continue;
      imputedRows.push({ server, test, vus, effRps: imputedVal });
    }
  }

  // 5. Scores
  const allRows    = [...effRows, ...imputedRows];
  const { scores, rawScores } = computeScores(allRows);
  const weightedRpsList = computeWeightedRps(allRows);

  // Group weightedRps by server
  const weightedRpsMap: Record<string, Record<string, number>> = {};
  for (const { server, test, value } of weightedRpsList) {
    if (!weightedRpsMap[server]) weightedRpsMap[server] = {};
    weightedRpsMap[server][test] = value;
  }

  // rawRps: max effRps per (server, test) across VU levels
  const rawRpsMap: Record<string, Record<string, number>> = {};
  for (const row of effRows) {
    if (!rawRpsMap[row.server]) rawRpsMap[row.server] = {};
    rawRpsMap[row.server][row.test] = Math.max(rawRpsMap[row.server][row.test] ?? 0, row.effRps);
  }

  // imputedRps: only for tests where the server has NO real data at all
  const imputedRpsMap: Record<string, Record<string, number>> = {};
  for (const row of imputedRows) {
    if (rawRpsMap[row.server]?.[row.test] !== undefined) continue;
    if (!imputedRpsMap[row.server]) imputedRpsMap[row.server] = {};
    imputedRpsMap[row.server][row.test] = Math.max(imputedRpsMap[row.server][row.test] ?? 0, row.effRps);
  }

  // 6. Assemble
  const presentTests = new Set(effRows.map(r => r.test));
  const tests = TEST_IDS.filter(t => presentTests.has(t));

  const serverList: ServerData[] = servers.map(server => {
    const score    = scores.get(server) ?? 0;
    const rawScore = rawScores.get(server) ?? 0;

    return {
      id:          server,
      score:       +score.toFixed(4),
      rawScore:    +rawScore.toFixed(4),
      snapshot:    snapshotData[server]  ?? { cpuPct: null, memBytes: null, dataBytes: null },
      preflight:   preflightData[server]  ?? {},
      rawRps:      rawRpsMap[server]      ?? {},
      imputedRps:  imputedRpsMap[server]  ?? {},
      weightedRps: weightedRpsMap[server] ?? {},
      benchmark:   benchmarkData[server]  ?? {},
    };
  }).sort((a, b) => b.score - a.score);

  return {
    run,
    date: opts.date ?? new Date().toISOString().split('T')[0],
    config: {
      vus:              [...VU_LEVELS],
      tests,
      testDuration:     opts.testDuration ?? '30s',
      imputePercentile: IMPUTE_PERCENTILE,
      bias:             BIAS,
    },
    servers: serverList,
  };
}
