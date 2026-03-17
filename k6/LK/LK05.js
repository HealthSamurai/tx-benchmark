// CodeSystem/$lookup — SNOMED codes that do not exist (negative test)
// Measures server behaviour and latency for not-found lookups.
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { CodeSystem_lookup_GET } from '../lib/fhir.js';
import { loadPool } from '../lib/pool.js';
import http from 'k6/http';

// 404 is the correct response for this test — do not count as error
http.setResponseCallback(http.expectedStatuses(200, 404));

const SNOMED     = 'http://snomed.info/sct';
const KNOWN_CODE = '999973211009'; // non-existent: real code prefixed with 9999

const codes   = loadPool('snomed/codes-nonexistent.json');
const request = (code) => CodeSystem_lookup_GET({ system: SNOMED, code });

// ─── Benchmark ────────────────────────────────────────────────────────────

export default runTest({
  pool: codes,
  request,
  checks: {
    'not found': (r) => r.status === 404 || (r.status === 200 && r.json()?.issue?.[0]?.code === 'not-found'),
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────

export const preflight = {
  id: 'LK05',
  knownEntry: KNOWN_CODE,
  request,
  // A not-found response IS the expected outcome — the operation is supported
  supported: (r) => r.status !== 501,
  checks: {
    'not found':          (r) => r.status === 404 || (r.status === 200 && r.json()?.issue?.[0]?.code === 'not-found'),
    'is OperationOutcome':(r) => r.json()?.resourceType === 'OperationOutcome',
  },
};
