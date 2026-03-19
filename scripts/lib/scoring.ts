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

import { BIAS } from './bias.ts';

export type EffRow = { server: string; test: string; vus: string; effRps: number };

export function computeScores(rows: EffRow[]): Map<string, number> {
  if (rows.length === 0) return new Map();

  // Step 1: per (server, test) → max effective RPS across VU levels
  const serverTestMax = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.server}|${row.test}`;
    serverTestMax.set(key, Math.max(serverTestMax.get(key) ?? 0, row.effRps));
  }

  const servers = [...new Set(rows.map(r => r.server))];
  const tests   = [...new Set(rows.map(r => r.test))];

  // Step 2: average effective RPS per test across all servers (for normalization)
  const testAvg = new Map<string, number>();
  for (const test of tests) {
    const vals = servers
      .map(s => serverTestMax.get(`${s}|${test}`))
      .filter((v): v is number => v !== undefined);
    testAvg.set(test, vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  }

  const lk01Avg = testAvg.get('LK01') ?? 1;

  // Step 3: weighted sum per server
  const rawScores = new Map<string, number>();
  for (const server of servers) {
    let score = 0;
    for (const test of tests) {
      const effRps = serverTestMax.get(`${server}|${test}`) ?? 0;
      const avg    = testAvg.get(test) ?? 1;
      const weight = avg > 0 ? lk01Avg / avg : 0;
      const bias   = BIAS[test] ?? 1.0;
      score += effRps * weight * bias;
    }
    rawScores.set(server, score);
  }

  // Step 4: normalize to percentage of top score
  const top = Math.max(...rawScores.values());
  const scores = new Map<string, number>();
  for (const [server, raw] of rawScores) {
    scores.set(server, top > 0 ? (raw / top) * 100 : 0);
  }

  return scores;
}
