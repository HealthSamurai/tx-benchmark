#!/usr/bin/env bun
// export-run.ts --run <run-id> [--date YYYY-MM-DD] [--test-duration 30s]
//
// Reads all result files for a run, computes scores and weighted RPS,
// and writes a self-contained JSON to site/src/data/<run>.json.
// Also updates site/src/data/runs.json with the run entry.

import { parseArgs } from 'node:util';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { loadRun } from './lib/loader.ts';

const { values } = parseArgs({
  options: {
    run:           { type: 'string' },
    date:          { type: 'string' },
    'test-duration': { type: 'string' },
  },
});

if (!values.run) {
  console.error('Usage: bun scripts/export-run.ts --run <run-id> [--date YYYY-MM-DD] [--test-duration 30s]');
  process.exit(1);
}

const run = values.run;
const outDir = 'site/src/data';

mkdirSync(outDir, { recursive: true });

console.log(`\nLoading run ${run}…`);

const data = loadRun(run, {
  date:         values.date,
  testDuration: values['test-duration'],
});

// Write run data
const outPath = `${outDir}/${run}.json`;
writeFileSync(outPath, JSON.stringify(data, null, 2));
console.log(`✓ Written ${outPath}`);
console.log(`  ${data.servers.length} servers, ${data.config.tests.length} tests`);
data.servers.forEach(s => console.log(`  ${s.id.padEnd(16)} score=${s.score.toFixed(1).padStart(5)}`));

// Update runs.json index
const runsPath = `${outDir}/runs.json`;
const runs: { id: string; date: string }[] = existsSync(runsPath)
  ? JSON.parse(readFileSync(runsPath, 'utf8'))
  : [];

if (!runs.find(r => r.id === run)) {
  runs.unshift({ id: run, date: data.date });
  runs.sort((a, b) => b.date.localeCompare(a.date));
  writeFileSync(runsPath, JSON.stringify(runs, null, 2));
  console.log(`✓ Updated ${runsPath}`);
}
