// ValueSet/$expand — SNOMED combined filters (ad-hoc POST)
// Pool entries: { count, textFilter, include }
// Every entry combines: is-a (hierarchy) + property= (attribute) + textFilter (display search)
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_expand_POST } from '../lib/fhir.js';
import { isValueSetExpansion } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const SNOMED = 'http://snomed.info/sct';

const entries = loadPool('snomed/snomed-combined.json');

const request = ({ include, count, textFilter }) =>
  ValueSet_expand_POST({
    valueSet: {
      resourceType: 'ValueSet',
      compose: { include: include.map((filter) => ({ system: SNOMED, filter })) },
    },
    filter: textFilter,
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

const KNOWN_ENTRY = {
  count:      10,
  textFilter: 'fracture',
  include: [[
    { property: 'concept',    op: 'is-a', value: '404684003' }, // Clinical finding
    { property: '116676008',  op: '=',    value: '72704001'  }, // assoc morphology = fracture
  ]],
};

export const preflight = {
  id: 'EX08',
  knownEntry: KNOWN_ENTRY,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'correct count': (r) => r.json()?.expansion?.contains?.length === 10,
  },
};
