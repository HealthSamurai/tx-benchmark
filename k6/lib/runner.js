import { check } from 'k6';
import http from 'k6/http';
import { BASE_URL, SERVER_NAME, RUN_ID } from './config.js';

// Re-export from test files: export { options, handleSummary } from '../lib/runner.js';
export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const DEFAULT_HEADERS = {
  'Accept': 'application/fhir+json',
};

/**
 * Returns a k6 default function that picks a random entry from pool,
 * builds a request, executes it, and runs checks.
 *
 * VU count and duration are set via CLI flags, not here.
 */
export function runTest({ pool, request, checks }) {
  return function () {
    const entry = pool[Math.floor(Math.random() * pool.length)];
    const { path, method = 'GET', body = null, headers = {} } = request(entry);

    const params = { headers: { ...DEFAULT_HEADERS, ...headers } };
    const url = `${BASE_URL}${path}`;

    const res = method === 'POST'
      ? http.post(url, body, params)
      : http.get(url, params);

    check(res, checks);
  };
}

/**
 * Writes a compact benchmark summary to results/benchmark/{server}/{test}_vus{n}.json.
 * Re-export this from each test file:
 *   export { handleSummary } from '../lib/runner.js';
 */
export function handleSummary(data) {
  const server  = SERVER_NAME;
  const test    = __ENV.TEST_ID  || 'unknown';
  const vus     = __ENV.VUS      || '1';

  const m = data.metrics;

  const summary = {
    run:       RUN_ID,
    server,
    test,
    vus:       parseInt(vus),
    timestamp: new Date().toISOString(),
    duration:  {
      p50: m.http_req_duration?.values?.med,
      p95: m.http_req_duration?.values?.['p(95)'],
      p99: m.http_req_duration?.values?.['p(99)'],
      avg: m.http_req_duration?.values?.avg,
      min: m.http_req_duration?.values?.min,
      max: m.http_req_duration?.values?.max,
    },
    throughput:  m.http_reqs?.values?.rate,
    error_rate:  m.http_req_failed?.values?.rate,
    checks_pass: m.checks?.values?.passes,
    checks_fail: m.checks?.values?.fails,
    iterations:  m.iterations?.values?.count,
  };

  const outPath = `results/${server}/benchmark/${test}_vus${vus}.json`;

  return {
    [outPath]: JSON.stringify(summary, null, 2),
  };
}
