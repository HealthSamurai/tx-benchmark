import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { CodeSystem_lookup_GET } from '../lib/fhir.js';
import { isParameters, hasDisplay, paramMatches } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const LOINC = 'http://loinc.org';
const KNOWN_CODE = '8867-4'; // Heart rate

const codes = loadPool('loinc/codes.json');
const request = (code) => CodeSystem_lookup_GET({ system: LOINC, code });

// ─── Benchmark ────────────────────────────────────────────────────────────

export default runTest({
  pool: codes,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'is Parameters': (r) => isParameters(r),
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────

export const preflight = {
  id: 'LK02',
  knownEntry: KNOWN_CODE,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'is Parameters': (r) => isParameters(r),
    'has display':   (r) => hasDisplay(r),
    'code echoed':   (r) => paramMatches(r, 'code', 'valueCode', KNOWN_CODE, false),
    'system matches':(r) => paramMatches(r, 'system', 'valueUri', LOINC, false),
  },
};
