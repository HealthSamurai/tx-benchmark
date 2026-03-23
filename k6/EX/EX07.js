// ValueSet/$expand — multi-system text filter (ad-hoc POST)
// Pool entries: { filter, systems, count }
// Covers text-filter expansion across combinations of SNOMED, LOINC, and RxNorm.
// Short counts test server short-circuiting (first system satisfies the request);
// higher counts force multi-system resolution and result merging.
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_expand_POST } from '../lib/fhir.js';
import { isValueSetExpansion } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const entries = loadPool('multi/multi-system-text.json');

const request = ({ filter, systems, count }) =>
  ValueSet_expand_POST({
    valueSet: {
      resourceType: 'ValueSet',
      compose: { include: systems.map(system => ({ system })) },
    },
    filter,
    count,
  });

// ─── Benchmark ────────────────────────────────────────────────────────────────

export default runTest({
  pool: entries,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'has results':   (r) => (r.json()?.expansion?.contains?.length ?? 0) > 0,
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────────

const KNOWN_ENTRY = {
  filter:  'amphetamine',
  systems: [
    'http://snomed.info/sct',
    'http://loinc.org',
    'http://www.nlm.nih.gov/research/umls/rxnorm',
  ],
  count: 200,
};

export const preflight = {
  id: 'EX07',
  knownEntry: KNOWN_ENTRY,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'has results':   (r) => (r.json()?.expansion?.contains?.length ?? 0) > 0,
  },
};
