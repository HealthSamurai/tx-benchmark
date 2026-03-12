import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { CodeSystem_lookup_GET } from '../lib/fhir.js';
import { isParameters, hasDisplay, echoedCode } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const SNOMED = 'http://snomed.info/sct';
const KNOWN_CODE = '73211009'; // Diabetes mellitus

const codes = loadPool('snomed/codes.json');
const request = (code) => CodeSystem_lookup_GET({ system: SNOMED, code });

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
  id: 'LK01',
  knownEntry: KNOWN_CODE,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'is Parameters': (r) => isParameters(r),
    'has display':   (r) => hasDisplay(r),
    'code echoed':   (r) => echoedCode(r, KNOWN_CODE),
    'system matches':(r) => r.json()?.parameter?.find(p => p.name === 'system')?.valueUri === SNOMED,
  },
};
