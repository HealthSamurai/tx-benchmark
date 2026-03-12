/**
 * Preflight — correctness checks, one pass per server.
 *
 * Run with:
 *   k6 run --env BASE_URL=http://localhost:7001/fhir --env SERVER_NAME=termbox preflight/run.js
 *
 * Outputs preflight/results/{SERVER_NAME}.json.
 * The benchmark runner reads this to know which tests to skip per server.
 */
import { runPreflight, parseResults, buildOutput, renderTable } from './lib.js';
import * as LK from './tests/LK.js';

export const options = { vus: 1, iterations: 1 };

const BASE_URL    = __ENV.BASE_URL;
const SERVER_NAME = __ENV.SERVER_NAME || 'unknown';

const ALL_TESTS = [
  ...Object.values(LK),
  // TODO: add VC, EX, TR, SB, FT, FL, CQ as they are defined
];

export default function () {
  for (const def of ALL_TESTS) {
    runPreflight(def, BASE_URL);
  }
}

export function handleSummary(data) {
  const results = parseResults(data.root_group);
  const output  = buildOutput(SERVER_NAME, BASE_URL, results);
  const outPath = `preflight/results/${SERVER_NAME}.json`;
  return {
    [outPath]: JSON.stringify(output, null, 2),
    stdout:    renderTable(output) + '\n',
  };
}
