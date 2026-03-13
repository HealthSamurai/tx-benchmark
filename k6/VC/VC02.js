// ValueSet/$validate-code — SNOMED implicit ValueSet, code + display
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_validate_code_GET } from '../lib/fhir.js';
import { isParameters, validationResult } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const SNOMED_VS  = 'http://snomed.info/sct?fhir_vs';
const SNOMED     = 'http://snomed.info/sct';
const KNOWN_CODE = '73211009';
const KNOWN_DISPLAY = 'Diabetes mellitus';

// Pool entries are [code, display] tuples
const tuples  = loadPool('snomed/code-display.json');
const request = ([code, display]) => ValueSet_validate_code_GET({ url: SNOMED_VS, system: SNOMED, code, display });

// ─── Benchmark ────────────────────────────────────────────────────────────

export default runTest({
  pool: tuples,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'is Parameters': (r) => isParameters(r),
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────

export const preflight = {
  id: 'VC02',
  knownEntry: [KNOWN_CODE, KNOWN_DISPLAY],
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'is Parameters': (r) => isParameters(r),
    'result true':   (r) => validationResult(r) === true,
  },
};
