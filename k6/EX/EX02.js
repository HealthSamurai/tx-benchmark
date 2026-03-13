// ValueSet/$expand — RxNorm full codesystem, ad-hoc ValueSet, varying counts (10, 100, 1000)
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_expand_POST } from '../lib/fhir.js';
import { isValueSetExpansion } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

const RXNORM_VS = {
  resourceType: 'ValueSet',
  compose: { include: [{ system: RXNORM }] },
};

const counts  = loadPool('expand/counts.json');
const request = (count) => ValueSet_expand_POST({ valueSet: RXNORM_VS, count });

// ─── Benchmark ────────────────────────────────────────────────────────────

export default runTest({
  pool: counts,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────

export const preflight = {
  id: 'EX02',
  knownEntry: 10,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'correct count': (r) => r.json()?.expansion?.contains?.length === 10,
  },
};
