// ValueSet/$expand — extensional VSAC ValueSets (SNOMED, LOINC, RxNorm)
// Pool entries: { url, count, filter? }
// Covers 10 large VSAC valuesets with counts 10/100/1000,
// plus filtered variants using domain-relevant terms.
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_expand_GET } from '../lib/fhir.js';
import { isValueSetExpansion } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const entries = loadPool('vsac/vsac-entries.json');
const request = ({ url, count, filter }) =>
  ValueSet_expand_GET({ url, count, filter });

// ─── Benchmark ────────────────────────────────────────────────────────────

export default runTest({
  pool: entries,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'has results':   (r) => (r.json()?.expansion?.contains?.length ?? 0) > 0,
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────

// SNOMED CT CORE Problem List, count=10 — a known-working mid-sized VS
const KNOWN_ENTRY = {
  url:   'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1018.240',
  count: 10,
};

export const preflight = {
  id: 'EX04',
  knownEntry: KNOWN_ENTRY,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'correct count': (r) => r.json()?.expansion?.contains?.length === 10,
  },
};
