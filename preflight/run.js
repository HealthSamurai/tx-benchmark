/**
 * Preflight — correctness checks, one pass per server.
 *
 * Run with:
 *   k6 run --env BASE_URL=http://localhost:7001/fhir --env SERVER_NAME=termbox preflight/run.js
 *
 * Outputs results/{SERVER_NAME}/preflight.json.
 * The benchmark runner reads this to know which tests to skip per server.
 */
import { runPreflight, parseResults, buildOutput, renderTable } from './lib.js';
import * as CM from './tests/CM.js';
import * as EX from './tests/EX.js';
import * as FS from './tests/FS.js';
import * as LK from './tests/LK.js';
import * as SS from './tests/SS.js';
import * as VC from './tests/VC.js';

export const options = { vus: 1, iterations: 1 };

const BASE_URL    = __ENV.BASE_URL;
const SERVER_NAME = __ENV.SERVER_NAME || 'unknown';

const ALL_TESTS = [
  ...Object.values(FS),
  ...Object.values(LK),
  ...Object.values(VC),
  ...Object.values(EX),
  ...Object.values(SS),
  ...Object.values(CM),
];

export default function () {
  for (const def of ALL_TESTS) {
    runPreflight(def, BASE_URL);
  }
}

export function handleSummary(data) {
  const results = parseResults(data.root_group);
  const output  = buildOutput(SERVER_NAME, BASE_URL, results);
  const outPath = `results/${SERVER_NAME}/preflight.json`;
  return {
    [outPath]: JSON.stringify(output, null, 2),
    stdout:    renderTable(output) + '\n',
  };
}
