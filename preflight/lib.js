/**
 * Preflight infrastructure: runner, output formatting.
 *
 * Uses k6's group() + check() so results flow through data.root_group
 * into handleSummary — no shared state needed between VU and summary contexts.
 */
import { group, check } from 'k6';
import http from 'k6/http';

export const FHIR_HEADERS = { headers: { Accept: 'application/fhir+json' } };

// ─── Runner ───────────────────────────────────────────────────────────────

/**
 * Runs a preflight test case inside a k6 group.
 * Adds a 'supported' check first — if it fails (404/501), remaining checks are skipped.
 */
export function runPreflight(def, baseUrl) {
  group(def.id, () => {
    const { path, method = 'GET', body = null, headers = {} } = def.request(def.knownEntry);
    const params = { headers: { ...FHIR_HEADERS.headers, ...headers } };
    const url = `${baseUrl}${path}`;
    const res = method === 'POST'
      ? http.post(url, body, params)
      : http.get(url, params);

    const supportedFn = def.supported ?? ((r) => r.status !== 404 && r.status !== 501);
    const supported = check(res, { 'supported': supportedFn });

    if (!supported) return;

    // Pre-evaluate each check. For failures, encode diagnostic data in the check
    // name using a ||| separator so parseResults can surface it from handleSummary.
    const checkSpec = {};
    for (const [name, fn] of Object.entries(def.checks)) {
      if (fn(res)) {
        checkSpec[name] = () => true;
      } else {
        let bodyVal;
        try { bodyVal = res.json(); } catch (_) { bodyVal = res.body ? res.body.slice(0, 500) : null; }
        const diag = JSON.stringify({ http_status: res.status, body: bodyVal });
        checkSpec[`${name}|||${diag}`] = () => false;
      }
    }
    check(res, checkSpec);
  });
}

// ─── Summary parsing ──────────────────────────────────────────────────────

/**
 * Transforms data.root_group into our results format.
 * Each group corresponds to one preflight test case.
 */
export function parseResults(rootGroup) {
  const results = {};

  for (const g of rootGroup.groups) {
    const checks = g.checks;
    const supported = checks.find(c => c.name === 'supported');

    if (supported?.fails > 0) {
      results[g.name] = { status: 'skip', reason: 'operation not supported' };
      continue;
    }

    const failed = checks
      .filter(c => c.name !== 'supported' && c.fails > 0)
      .map(c => {
        const sep = c.name.indexOf('|||');
        if (sep === -1) return { check: c.name };
        const checkName = c.name.slice(0, sep);
        try {
          return { check: checkName, ...JSON.parse(c.name.slice(sep + 3)) };
        } catch (_) {
          return { check: checkName };
        }
      });

    results[g.name] = failed.length === 0
      ? { status: 'pass' }
      : { status: 'fail', failed_checks: failed };
  }

  return results;
}

// ─── Output ───────────────────────────────────────────────────────────────

export function buildOutput(serverName, baseUrl, results) {
  return {
    run:       __ENV.RUN_ID || new Date().toISOString().slice(0, 16),
    server:    serverName,
    timestamp: new Date().toISOString(),
    base_url:  baseUrl,
    tests:     results,
  };
}

export function renderTable(output) {
  const lines = [`\nPreflight: ${output.server} (${output.base_url})\n`];
  for (const [id, r] of Object.entries(output.tests)) {
    const icon   = r.status === 'pass' ? '✓' : r.status === 'skip' ? '~' : '✗';
    const detail = r.status === 'fail' ? ` — failed: ${r.failed_checks.map(f => f.check).join(', ')}` :
                   r.status === 'skip' ? ` — ${r.reason}` : '';
    lines.push(`  ${icon} ${id}${detail}`);
  }
  return lines.join('\n');
}
