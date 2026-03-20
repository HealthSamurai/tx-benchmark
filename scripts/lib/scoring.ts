// Composite scoring algorithm.
//
// Input: all effective-RPS rows for a run (real + imputed).
//   EffRow = { server, test, vus, effRps }
//
// Algorithm:
//   1. Per (server, test): pick the max effective RPS across VU levels.
//   2. Normalizing weight per test: avg_rps_LK01 / avg_rps_of_test
//      (TechEmpower-style — LK01 is the reference; slow tests get a higher
//       weight so they contribute equally regardless of their natural RPS scale)
//   3. Raw score per server: Σ (max_eff_rps × weight × bias)
//   4. Normalize: raw / top_raw × 100  →  percentage of the best server
//
// Returns: Map<server, score (0–100)>
// Also returns per-(server,test) weighted RPS via computeWeightedRps.

import { BIAS } from '../../config/bias.ts';

export type EffRow = { server: string; test: string; vus: string; effRps: number };

// Intermediate per-(server, test) weighted RPS: max_eff_rps × weight × bias.
// Key: "server|test"
export type WeightedRpsMap = Map<string, number>;

function buildWeightedRps(rows: EffRow[]): { weightedRps: WeightedRpsMap; servers: string[]; tests: string[] } {
  const serverTestMax = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.server}|${row.test}`;
    serverTestMax.set(key, Math.max(serverTestMax.get(key) ?? 0, row.effRps));
  }

  const servers = [...new Set(rows.map(r => r.server))];
  const tests   = [...new Set(rows.map(r => r.test))];

  const testAvg = new Map<string, number>();
  for (const test of tests) {
    const vals = servers
      .map(s => serverTestMax.get(`${s}|${test}`))
      .filter((v): v is number => v !== undefined);
    testAvg.set(test, vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  }

  const lk01Avg = testAvg.get('LK01') ?? 1;

  const weightedRps: WeightedRpsMap = new Map();
  for (const server of servers) {
    for (const test of tests) {
      const effRps = serverTestMax.get(`${server}|${test}`) ?? 0;
      const avg    = testAvg.get(test) ?? 1;
      const weight = avg > 0 ? lk01Avg / avg : 0;
      const bias   = BIAS[test] ?? 1.0;
      weightedRps.set(`${server}|${test}`, effRps * weight * bias);
    }
  }

  return { weightedRps, servers, tests };
}

// Arithmetic weighted sum.
// See METHODOLOGY.md for the full algorithm description.
export function computeScores(rows: EffRow[]): Map<string, number> {
  if (rows.length === 0) return new Map();

  const { weightedRps, servers, tests } = buildWeightedRps(rows);

  const rawScores = new Map<string, number>();
  for (const server of servers) {
    const score = tests.reduce((sum, test) => sum + (weightedRps.get(`${server}|${test}`) ?? 0), 0);
    rawScores.set(server, score);
  }

  const top = Math.max(...rawScores.values());
  const scores = new Map<string, number>();
  for (const [server, raw] of rawScores) {
    scores.set(server, top > 0 ? (raw / top) * 100 : 0);
  }

  return scores;
}

// Returns per-(server, test) weighted RPS for pushing as benchmark_weighted_rps.
export function computeWeightedRps(rows: EffRow[]): { server: string; test: string; value: number }[] {
  if (rows.length === 0) return [];
  const { weightedRps } = buildWeightedRps(rows);
  return [...weightedRps.entries()].map(([key, value]) => {
    const [server, test] = key.split('|');
    return { server, test, value };
  });
}
