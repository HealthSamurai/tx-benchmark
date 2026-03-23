// ValueSet/$expand — SNOMED hierarchy (is-a), varying concepts, counts and offsets
// Pool entries: { concept, count, offset }
// 60 large / 20 mid / 20 small hierarchies, with count×offset combos sized to each.
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_expand_GET } from '../lib/fhir.js';
import { isValueSetExpansion } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const SNOMED = 'http://snomed.info/sct';

const entries = loadPool('snomed/snomed-expand.json');
const request = ({ concept, count, offset }) =>
  ValueSet_expand_GET({ url: `${SNOMED}?fhir_vs=isa/${concept}`, count, offset });

// ─── Benchmark ────────────────────────────────────────────────────────────

export default runTest({
  pool: entries,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────

export const preflight = {
  id: 'EX01',
  knownEntry: { concept: '404684003', count: 10, offset: 0 },
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'correct count': (r) => r.json()?.expansion?.contains?.length === 10,
  },
};
