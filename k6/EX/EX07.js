// ValueSet/$expand — SNOMED hierarchy filters (ad-hoc POST)
// Pool entries: { count, include }
// Covers descendent-of, child-of, descendent-leaf, generalizes, in, not-in, exists
// Pool is harvested from live DB — see scripts/harvest-snomed-hierarchy.js
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_expand_POST } from '../lib/fhir.js';
import { isValueSetExpansion } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const SNOMED = 'http://snomed.info/sct';

const entries = loadPool('snomed/snomed-hierarchy.json');

const request = ({ include, count }) =>
  ValueSet_expand_POST({
    valueSet: {
      resourceType: 'ValueSet',
      compose: { include: include.map((filter) => ({ system: SNOMED, filter })) },
    },
    count,
  });

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

// Disease (64572001) has 166 direct children — child-of count=10 is always satisfied.
const KNOWN_ENTRY = {
  count:   10,
  include: [[
    { property: 'concept', op: 'child-of', value: '64572001' },
  ]],
};

export const preflight = {
  id: 'EX07',
  knownEntry: KNOWN_ENTRY,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'correct count': (r) => r.json()?.expansion?.contains?.length === 10,
  },
};
