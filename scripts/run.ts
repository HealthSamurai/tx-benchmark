#!/usr/bin/env bun
// run.ts <server> <base-url> [run-id] [resume-from] [--amend] [--tests T1,T2]
//
// Runs the full benchmark for one server:
//   1. Preflight  — correctness checks, outputs results/{run}/{server}/preflight.json
//   2. Snapshot   — idle resource footprint
//   3. Warmup     — JIT + connection pool warm-up, results discarded
//   4. Benchmark  — for each passing test: VUs=1, 10, 50 (test-outer order)
//   5. Push       — summary metrics to Prometheus Pushgateway
//
// run-id tags all results for this run (default: current datetime).
// Use the same run-id across all servers to group them into one benchmark run.
//
// resume-from resumes a previously aborted run starting at TEST_ID or TEST_ID/VUS.
// The resume point is printed automatically when a server crash is detected.
//
// --amend patches an existing run for a server without re-running preflight or snapshots.
//   Requires an explicit run-id. Optionally filter to specific tests with --tests.
//   Examples:
//     bun scripts/run.ts termbox http://localhost:7001/fhir mar-26 --amend
//     bun scripts/run.ts termbox http://localhost:7001/fhir mar-26 --amend --tests LK04,LK05
//
// If RESTART_CMD is set, the runner will automatically restart the server on crash,
// wait up to 5 minutes for it to be live, and resume — instead of exiting.
//
// Examples:
//   RUN=2026-03-15T14:00
//   bun scripts/run.ts termbox    http://localhost:7001/fhir $RUN
//   bun scripts/run.ts ontoserver https://tx.example.com/fhir $RUN
//   bun scripts/run.ts termbox    http://localhost:7001/fhir $RUN EX03/10
//   RESTART_CMD="docker compose -f /path/to/server/docker-compose.yml up -d" \
//     bun scripts/run.ts myserver http://localhost:8080/fhir $RUN
//
// Dependencies: k6

import { $ } from 'bun';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { TESTS, VU_LEVELS, PROM_URL } from './lib/constants.ts';

// ── Args ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

// Parse flags
const amendMode  = argv.includes('--amend');
const testsIdx   = argv.indexOf('--tests');
const testsArg   = testsIdx !== -1 ? argv[testsIdx + 1] : null;
const testsFilter: Set<string> | null = testsArg
  ? new Set(testsArg.split(',').map(s => s.trim().toUpperCase()))
  : null;

// Strip flags from positional args
const positional = argv.filter((a, i) =>
  !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))
);

const [server, baseUrl, runArg, resumeFrom] = positional;

if (!server || !baseUrl) {
  console.error('Usage: run.ts <server> <base-url> [run-id] [resume-from]');
  console.error('       run.ts <server> <base-url> <run-id> --amend [--tests LK04,LK05]');
  process.exit(1);
}

if (amendMode && !runArg) {
  console.error('ERROR: --amend requires an explicit run-id.');
  process.exit(1);
}

if (amendMode && resumeFrom) {
  console.error('ERROR: --amend and resume-from are mutually exclusive.');
  process.exit(1);
}

const runId       = runArg ?? new Date().toISOString().slice(0, 16).replace('T', 'T');
const restartCmd  = process.env.RESTART_CMD ?? '';
const duration    = process.env.DURATION ?? '30s';
const promUrl     = `${PROM_URL}/api/v1/write`;

const RESTART_TIMEOUT = 60;  // max attempts at 5s each ≈ 5 minutes
const WARMUP_VUS      = 10;
const WARMUP_DURATION = '5s';
const INTER_TEST_SLEEP_MS = 5000;

// ── Resume logic ─────────────────────────────────────────────────────────────

let resumeTest = '';
let resumeVus  = '';

if (resumeFrom) {
  const slash = resumeFrom.indexOf('/');
  if (slash === -1) {
    resumeTest = resumeFrom;
  } else {
    resumeTest = resumeFrom.slice(0, slash);
    resumeVus  = resumeFrom.slice(slash + 1);
  }
  console.log(`Resuming from test=${resumeTest}${resumeVus ? `, vus=${resumeVus}` : ''}`);
}

let resuming = !!resumeTest;

function shouldSkip(testId: string, vus: number): boolean {
  if (!resuming) return false;

  if (testId === resumeTest) {
    if (!resumeVus || String(vus) === resumeVus) {
      resuming = false;
      return false;
    }
    return true;
  }
  return true;
}

function nextResume(testId: string, vus: number): string {
  const vuList = [...VU_LEVELS];
  const vuIdx  = vuList.indexOf(vus as typeof VU_LEVELS[number]);
  if (vuIdx !== -1 && vuIdx < vuList.length - 1) {
    return `${testId}/${vuList[vuIdx + 1]}`;
  }
  // Last VU level — advance to the next passing test
  let foundTest = false;
  for (const t of TESTS) {
    const tid = t.split('/').pop()!.replace('.js', '');
    if (foundTest && passed(tid)) return `${tid}/${vuList[0]}`;
    if (tid === testId) foundTest = true;
  }
  return '';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function header(msg: string) {
  console.log(`\n=== ${msg} ===\n`);
}

function passed(testId: string): boolean {
  const path = `results/${runId}/${server}/preflight.json`;
  try {
    const pf = JSON.parse(readFileSync(path, 'utf8'));
    return pf?.tests?.[testId]?.status === 'pass';
  } catch {
    return false;
  }
}

async function serverAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/metadata`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer(testId: string, vus: number): Promise<void> {
  if (await serverAlive()) return;

  console.log(`\nWARNING: ${server} is not responding after ${testId}/vus${vus}.`);

  if (!restartCmd) {
    const next = nextResume(testId, vus);
    console.log('Restart the server, then resume with:');
    console.log(`  bun scripts/run.ts ${server} ${baseUrl} ${runId}${next ? ` ${next}` : ''}`);
    process.exit(1);
  }

  console.log(`Restarting: ${restartCmd}`);
  await $`sh -c ${restartCmd}`;

  for (let attempts = 0; attempts < RESTART_TIMEOUT; attempts++) {
    await Bun.sleep(5000);
    if (await serverAlive()) {
      console.log(`  ${server} is back up. Resuming.`);
      return;
    }
    console.log(`  Waiting for ${server}… (${attempts + 1}/${RESTART_TIMEOUT})`);
  }

  const next = nextResume(testId, vus);
  console.log(`ERROR: ${server} did not come back after restart. Resume with:`);
  console.log(`  bun scripts/run.ts ${server} ${baseUrl} ${runId}${next ? ` ${next}` : ''}`);
  process.exit(1);
}

// ── Check Prometheus ─────────────────────────────────────────────────────────

const promHealthy = await fetch('http://localhost:9090/-/healthy', { signal: AbortSignal.timeout(3000) })
  .then(r => r.ok).catch(() => false);

if (!promHealthy) {
  console.error('ERROR: Prometheus is not reachable at localhost:9090.');
  console.error('Start the observability stack first: cd observability && docker compose up -d');
  process.exit(1);
}

// ── 1. Preflight ─────────────────────────────────────────────────────────────

if (amendMode) {
  const preflightPath = `results/${runId}/${server}/preflight.json`;
  if (!existsSync(preflightPath)) {
    console.error(`ERROR: No existing preflight found at ${preflightPath}. Run without --amend first.`);
    process.exit(1);
  }

  if (testsFilter) {
    header(`1/4 Partial preflight: ${server} (${[...testsFilter].join(', ')})`);

    const k6Env = [
      '--env', `BASE_URL=${baseUrl}`,
      '--env', `SERVER_NAME=${server}`,
      '--env', `RUN_ID=${runId}`,
      '--env', `TESTS_FILTER=${[...testsFilter].join(',')}`,
      '--env', 'PREFLIGHT_PATCH=1',
    ];
    await $`k6 ${['run', ...k6Env, 'preflight/run.js']}`;

    // Merge patch into existing preflight.json
    const patchPath = `results/${runId}/${server}/preflight.patch.json`;
    const existing  = JSON.parse(readFileSync(preflightPath, 'utf8'));
    const patch     = JSON.parse(readFileSync(patchPath, 'utf8'));
    existing.tests  = { ...existing.tests, ...patch.tests };
    existing.timestamp = patch.timestamp;
    writeFileSync(preflightPath, JSON.stringify(existing, null, 2));
    unlinkSync(patchPath);

    const passing = Object.entries(existing.tests as Record<string, { status: string }>)
      .filter(([id, v]) => testsFilter.has(id) && v.status === 'pass')
      .map(([k]) => k);
    console.log(`Passing: ${passing.join(', ') || 'none'}`);
  } else {
    console.log('Amending all tests — skipping preflight (using existing results).');
  }

  // ── Warmup ────────────────────────────────────────────────────────────────

  header(`Warmup: ${server} (${WARMUP_VUS} VUs, ${WARMUP_DURATION})`);
  await $`k6 ${['run', '--vus', String(WARMUP_VUS), '--duration', WARMUP_DURATION, '--env', `BASE_URL=${baseUrl}`, 'k6/warmup.js']}`;

} else if (!resumeFrom) {
  header(`1/4 Preflight: ${server}`);

  mkdirSync(`results/${runId}/${server}`, { recursive: true });

  await $`k6 ${['run', '--env', `BASE_URL=${baseUrl}`, '--env', `SERVER_NAME=${server}`, '--env', `RUN_ID=${runId}`, 'preflight/run.js']}`;

  const pf = JSON.parse(readFileSync(`results/${runId}/${server}/preflight.json`, 'utf8'));
  const passing = Object.entries(pf.tests as Record<string, { status: string }>)
    .filter(([, v]) => v.status === 'pass')
    .map(([k]) => k);

  if (passing.length === 0) {
    console.log('No tests passed preflight. Aborting.');
    process.exit(1);
  }

  console.log(`Passing: ${passing.join(', ')}`);

  // ── 2. Idle snapshot ────────────────────────────────────────────────────

  header(`2/4 Idle resource snapshot: ${server}`);
  await $`bun scripts/resource-snapshot.ts --server ${server} --label idle --run ${runId}`;

  // ── 3. Warmup ───────────────────────────────────────────────────────────

  header(`3/4 Warmup: ${server} (${WARMUP_VUS} VUs, ${WARMUP_DURATION})`);
  await $`k6 ${['run', '--vus', String(WARMUP_VUS), '--duration', WARMUP_DURATION, '--env', `BASE_URL=${baseUrl}`, 'k6/warmup.js']}`;

} else {
  console.log(`Skipping preflight/snapshot/warmup (resuming from ${resumeFrom})`);
}

// ── 4. Benchmark ─────────────────────────────────────────────────────────────

header(`4/4 Benchmark: ${server}`);

mkdirSync(`results/${runId}/${server}/benchmark`, { recursive: true });

const benchmarkStart = new Date().toISOString();
let firstTest = true;

for (const test of TESTS) {
  const testId = test.split('/').pop()!.replace('.js', '');

  if (testsFilter && !testsFilter.has(testId)) continue;

  if (!passed(testId)) {
    console.log(`  ~ ${testId} — skipped (not supported)`);
    continue;
  }

  if (!firstTest) await Bun.sleep(INTER_TEST_SLEEP_MS);
  firstTest = false;

  console.log(`--- ${testId} ---`);

  for (const vus of VU_LEVELS) {
    if (shouldSkip(testId, vus)) {
      console.log(`  ~ vus${vus} — skipped (resuming)`);
      continue;
    }

    console.log(`  → vus${vus}`);

    const k6Args = [
      'run',
      '--out', 'experimental-prometheus-rw',
      '--vus', String(vus),
      '--duration', duration,
      '--tag', `server=${server}`,
      '--tag', `test=${testId}`,
      '--tag', `vus=${vus}`,
      '--tag', `run=${runId}`,
      '--env', `BASE_URL=${baseUrl}`,
      '--env', `SERVER_NAME=${server}`,
      '--env', `TEST_ID=${testId}`,
      '--env', `VUS=${vus}`,
      '--env', `RUN_ID=${runId}`,
      test,
    ];
    await $`env K6_PROMETHEUS_RW_SERVER_URL=${promUrl} k6 ${k6Args}`;

    await ensureServer(testId, vus);
  }
}

header(`Done: ${server}`);

// ── 5. Peak memory snapshot ──────────────────────────────────────────────────

if (!amendMode) {
  await $`bun scripts/resource-snapshot.ts --server ${server} --label peak --run ${runId} --since ${benchmarkStart}`;
} else {
  console.log('Skipping peak snapshot (amend mode — keeping existing).');
}

// ── 6. Push results ──────────────────────────────────────────────────────────

header('5/5 Pushing results to Pushgateway');
await $`bun scripts/push-results.ts --run ${runId}`;
