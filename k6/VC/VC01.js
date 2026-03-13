// ValueSet/$validate-code — SNOMED implicit ValueSet, code only
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_validate_code_GET } from '../lib/fhir.js';
import { isParameters, validationResult } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const SNOMED_VS   = 'http://snomed.info/sct?fhir_vs';
const SNOMED      = 'http://snomed.info/sct';
const KNOWN_CODE  = '73211009'; // Diabetes mellitus

const codes  = loadPool('snomed/codes.json');
const request = (code) => ValueSet_validate_code_GET({ url: SNOMED_VS, system: SNOMED, code });

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
  id: 'VC01',
  knownEntry: KNOWN_CODE,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'is Parameters': (r) => isParameters(r),
    'result true':   (r) => validationResult(r) === true,
    'has display':   (r) => r.json()?.parameter?.find(p => p.name === 'display')?.valueString?.length > 0,
  },
};
