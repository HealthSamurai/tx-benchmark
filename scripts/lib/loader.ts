// loader.ts — reads raw result files for a run and returns a fully computed RunExport.
// Used by push-results.ts (Prometheus) and export-run.ts (website JSON).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { IMPUTE_PERCENTILE, VU_LEVELS, TEST_IDS } from './constants.ts';
import { BIAS } from '../../config/bias.ts';
import { buildRawRps, computeScores, type RawReading } from './scoring.ts';
import type { BenchmarkResult, PreflightResult, Snapshot, PreflightStatus } from './types.ts';

// ── Exported types ────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Main loader ───────────────────────────────────────────────────────────────

export function loadRun(run: string, opts: { date?: string; testDuration?: string } = {}): RunExport {
  const servers = getServers(run);

  // 1. Read raw benchmark files
  const readings: RawReading[] = [];
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

        // Per-VU benchmark data (for latency display in the site)
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

        readings.push({ server, test: r.test, effRps: r.throughput * (1 - r.error_rate) });
      }
    }

    // Preflight
    const preflight = readJson<PreflightResult>(`results/${run}/${server}/preflight.json`);
    preflightData[server] = preflight
      ? Object.fromEntries(Object.entries(preflight.tests).map(([t, v]) => [t, v.status]))
      : {};

    // Idle snapshot
    const snap = readJson<Snapshot>(`results/${run}/${server}/snapshot_idle.json`);
    snapshotData[server] = {
      cpuPct:    snap?.cpu_usage         ?? null,
      memBytes:  snap?.mem_used_bytes    ?? null,
      dataBytes: snap?.data_volume_bytes ?? null,
    };
  }

  // 2. Collapse readings → rawRps and determine which tests were run
  const rawRps = buildRawRps(readings);
  const presentTests = new Set(readings.map(r => r.test));
  const tests = TEST_IDS.filter(t => presentTests.has(t));

  // 3. Score
  const { imputedRps, wRps, scores, rawScores } = computeScores(
    servers, tests, rawRps, IMPUTE_PERCENTILE,
  );

  // 5. Assemble per-server output
  const serverList: ServerData[] = servers.map(server => {
    const rawRpsOut:     Record<string, number> = {};
    const imputedRpsOut: Record<string, number> = {};
    const weightedRpsOut: Record<string, number> = {};

    for (const test of tests) {
      const key = `${server}|${test}`;
      if (rawRps.has(key))     rawRpsOut[test]     = rawRps.get(key)!;
      if (imputedRps.has(key)) imputedRpsOut[test] = imputedRps.get(key)!;
      if (wRps.has(key))       weightedRpsOut[test] = wRps.get(key)!;
    }

    return {
      id:          server,
      score:       +(scores.get(server)    ?? 0).toFixed(4),
      rawScore:    +(rawScores.get(server) ?? 0).toFixed(4),
      snapshot:    snapshotData[server]  ?? { cpuPct: null, memBytes: null, dataBytes: null },
      preflight:   preflightData[server] ?? {},
      rawRps:      rawRpsOut,
      imputedRps:  imputedRpsOut,
      weightedRps: weightedRpsOut,
      benchmark:   benchmarkData[server] ?? {},
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
