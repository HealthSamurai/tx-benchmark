// scoring.ts — composite scoring algorithm.
//
// Input:
//   servers          — all server IDs in the run
//   tests            — all test IDs present in the run
//   rawRps           — Map<"server|test", number>  (real measured values only;
//                      servers that did not run a test are simply absent)
//   imputePercentile — percentile used for imputation (e.g. 30)
//
// Algorithm:
//   1. Impute: for every (server, test) where the server has no real data,
//              assign percentile([0, ...sorted real values for that test], pct).
//              The 0 floor ensures non-participants always score below the
//              worst real participant, with the discount increasing as fewer
//              servers take part in a test.
//   2. Normalizer per test: lk01Avg / testAvg
//              testAvg = mean of rawRps over REAL servers only.
//              (Imputed values must not affect the normalizer — they are derived
//              from real values and would create a feedback loop if included.)
//   3. wRps = fullRps × normalizer × bias
//   4. Score = Σ wRps per server, then normalize to 0–100 relative to top server.

import { BIAS } from '../../config/bias.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function percentile(sorted: number[], pct: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const pos = (pct / 100) * (n - 1);
  const lo  = Math.floor(pos);
  const hi  = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoringResult {
  /** Imputed RPS for (server, test) pairs the server did not run. */
  imputedRps: Map<string, number>;
  /** Weighted RPS for every (server, test) pair (real or imputed). */
  wRps:       Map<string, number>;
  /** Composite score per server, normalized 0–100 (top server = 100). */
  scores:     Map<string, number>;
  /** Unnormalized sum of wRps per server. */
  rawScores:  Map<string, number>;
  /** Per-test normalizer (lk01Avg / testAvg). Useful for verification. */
  normalizers: Map<string, number>;
}

// ── Step 0: collapse raw readings to (server, test) ──────────────────────────
//
// Each raw reading is one benchmark file: (server, test, vus).
// effRps = throughput × (1 − error_rate) — the error-adjusted throughput.
// rawRps[server][test] = max effRps across all VU levels the server ran.

export interface RawReading {
  server:    string;
  test:      string;
  effRps:    number;  // caller computes throughput × (1 − error_rate)
}

export function buildRawRps(readings: RawReading[]): Map<string, number> {
  const rawRps = new Map<string, number>();
  for (const { server, test, effRps } of readings) {
    const key = `${server}|${test}`;
    rawRps.set(key, Math.max(rawRps.get(key) ?? 0, effRps));
  }
  return rawRps;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function computeScores(
  servers:          string[],
  tests:            string[],
  rawRps:           Map<string, number>,  // key: "server|test"
  imputePercentile: number,
): ScoringResult {

  // Step 1 — Impute missing (server, test) pairs
  const imputedRps = new Map<string, number>();
  for (const test of tests) {
    const realVals = servers
      .map(s => rawRps.get(`${s}|${test}`))
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);

    if (realVals.length === 0) continue;

    const pool   = [0, ...realVals];
    const impVal = percentile(pool, imputePercentile);

    for (const server of servers) {
      if (!rawRps.has(`${server}|${test}`)) {
        imputedRps.set(`${server}|${test}`, impVal);
      }
    }
  }

  // Step 2 — Full RPS matrix: real values take priority, imputed fill gaps
  const fullRps = new Map<string, number>([...rawRps, ...imputedRps]);

  // Step 3 — Normalizer: lk01Avg / testAvg, using REAL servers only
  const testAvg = new Map<string, number>();
  for (const test of tests) {
    const realVals = servers
      .map(s => rawRps.get(`${s}|${test}`))
      .filter((v): v is number => v !== undefined);
    const avg = realVals.length > 0
      ? realVals.reduce((a, b) => a + b, 0) / realVals.length
      : 0;
    testAvg.set(test, avg);
  }

  const lk01Avg = testAvg.get('LK01') ?? 1;

  const normalizers = new Map<string, number>();
  for (const test of tests) {
    const avg = testAvg.get(test) ?? 0;
    normalizers.set(test, avg > 0 ? lk01Avg / avg : 0);
  }

  // Step 4 — wRps = fullRps × normalizer × bias
  const wRps = new Map<string, number>();
  for (const server of servers) {
    for (const test of tests) {
      const rps  = fullRps.get(`${server}|${test}`) ?? 0;
      const norm = normalizers.get(test) ?? 0;
      const bias = (BIAS as Record<string, number>)[test] ?? 1.0;
      wRps.set(`${server}|${test}`, rps * norm * bias);
    }
  }

  // Step 5 — Score = Σ wRps per server, normalized 0–100
  const rawScores = new Map<string, number>();
  for (const server of servers) {
    const total = tests.reduce((sum, t) => sum + (wRps.get(`${server}|${t}`) ?? 0), 0);
    rawScores.set(server, total);
  }

  const top = Math.max(0, ...rawScores.values());
  const scores = new Map<string, number>();
  for (const [server, raw] of rawScores) {
    scores.set(server, top > 0 ? (raw / top) * 100 : 0);
  }

  return { imputedRps, wRps, scores, rawScores, normalizers };
}
