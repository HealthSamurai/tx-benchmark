// ValueSet/$expand — RxNorm intensional ValueSets (ad-hoc POST)
// Pool entries: { label, count, compose }
// Covers single TTY, single relationship, AND (TTY+rel, rel+rel), OR (multi-include)
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_expand_POST } from '../lib/fhir.js';
import { isValueSetExpansion } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const entries = loadPool('rxnorm/rxnorm-intensional.json');

const request = ({ compose, count }) =>
  ValueSet_expand_POST({
    valueSet: { resourceType: 'ValueSet', compose },
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
  label:   'TTY=BN AND tradename_of=acetaminophen(161) count=10',
  count:   10,
  compose: {
    include: [{
      system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
      filter: [
        { property: 'TTY',          op: '=', value: 'BN'  },
        { property: 'tradename_of', op: '=', value: '161' },
      ],
    }],
  },
};

export const preflight = {
  id: 'EX05',
  knownEntry: KNOWN_ENTRY,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'correct count': (r) => r.json()?.expansion?.contains?.length === 10,
  },
};
