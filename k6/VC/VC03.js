// ValueSet/$validate-code — SNOMED isa hierarchies
// Pool mixes large (Clinical finding, Procedure), medium (Assessment scales,
// Organism, Allergy to drug), small (Body structure), and tiny (leaf-level) trees.
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_validate_code_GET } from '../lib/fhir.js';
import { isParameters, validationResult } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const SNOMED = 'http://snomed.info/sct';

// knownEntry for preflight: Myocardial infarction ∈ isa/Clinical finding
const KNOWN_ENTRY = {
  valueSetUrl: 'http://snomed.info/sct?fhir_vs=isa/404684003',
  code: '22298006', // Myocardial infarction
};

const entries = loadPool('snomed/isa-entries.json');
const request = ({ valueSetUrl, code }) =>
  ValueSet_validate_code_GET({ url: valueSetUrl, system: SNOMED, code });

// ─── Benchmark ────────────────────────────────────────────────────────────

export default runTest({
  pool: entries,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'is Parameters': (r) => isParameters(r),
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────

export const preflight = {
  id: 'VC03',
  knownEntry: KNOWN_ENTRY,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'is Parameters': (r) => isParameters(r),
    'result true':   (r) => validationResult(r) === true,
  },
};
