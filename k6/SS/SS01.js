// CodeSystem/$subsumes — SNOMED CT hierarchy
// Pool entries: { codeA, codeB, expected }
// expected ∈ { equivalent, subsumes, subsumed-by, not-subsumes }
// Covers all 4 FHIR subsumption outcomes across 3 depth buckets and
// cross-hierarchy / same-parent-sibling not-subsumes cases.
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { CodeSystem_subsumes_GET } from '../lib/fhir.js';
import { isParameters, paramMatches } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const SNOMED = 'http://snomed.info/sct';

const entries = loadPool('subsumes/snomed-subsumes.json');

const request = ({ codeA, codeB }) =>
  CodeSystem_subsumes_GET({ system: SNOMED, codeA, codeB });

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

// Disease (64572001) subsumes Influenza (6142004) — well-known, stable pair
const KNOWN_ENTRY = {
  codeA:    '64572001',  // Disease
  codeB:    '6142004',   // Influenza
  expected: 'subsumes',
};

export const preflight = {
  id: 'SS01',
  knownEntry: KNOWN_ENTRY,
  request,
  checks: {
    'status 200':      (r) => r.status === 200,
    'is Parameters':   (r) => isParameters(r),
    'outcome subsumes':(r) => paramMatches(r, 'outcome', 'valueCode', 'subsumes'),
  },
};
