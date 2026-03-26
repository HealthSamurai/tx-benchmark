// ValueSet/$expand — RxNorm intensional ValueSets (ad-hoc POST)
// Pool entries: { count, include }
// Covers single TTY, single relationship, AND (TTY+rel, rel+rel), OR (multi-include)
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_expand_POST } from '../lib/fhir.js';
import { isValueSetExpansion } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

const entries = loadPool('rxnorm/rxnorm-intensional.json');

const request = ({ include, count }) =>
  ValueSet_expand_POST({
    valueSet: {
      resourceType: 'ValueSet',
      compose: { include: include.map((filter) => ({ system: RXNORM, filter })) },
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

const KNOWN_ENTRY = {
  count:   10,
  include: [[
    { property: 'TTY',          op: '=', value: 'BN'  },
    { property: 'tradename_of', op: '=', value: 'CUI:161' },
  ]],
};

export const preflight = {
  id: 'EX06',
  knownEntry: KNOWN_ENTRY,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'correct count': (r) => r.json()?.expansion?.contains?.length === 10,
  },
};
