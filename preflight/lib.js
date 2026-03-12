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
    const { path } = def.request(def.knownEntry);
    const res = http.get(`${baseUrl}${path}`, FHIR_HEADERS);

    const supportedFn = def.supported ?? ((r) => r.status !== 404 && r.status !== 501);
    const supported = check(res, { 'supported': supportedFn });

    if (!supported) return;

    check(res, def.checks);
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
      .map(c => c.name);

    results[g.name] = failed.length === 0
      ? { status: 'pass' }
      : { status: 'fail', failed_checks: failed };
  }

  return results;
}

// ─── Output ───────────────────────────────────────────────────────────────

export function buildOutput(serverName, baseUrl, results) {
  return {
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
    const detail = r.status === 'fail' ? ` — failed: ${r.failed_checks.join(', ')}` :
                   r.status === 'skip' ? ` — ${r.reason}` : '';
    lines.push(`  ${icon} ${id}${detail}`);
  }
  return lines.join('\n');
}
