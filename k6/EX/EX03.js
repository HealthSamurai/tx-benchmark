// ValueSet/$expand — SNOMED implicit ValueSet with text filter
// Pool is a mix of high-frequency words, rare terms, and short prefixes
// to stress both common (many matches) and selective (few matches) searches.
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_expand_GET } from '../lib/fhir.js';
import { isValueSetExpansion } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const SNOMED_VS = 'http://snomed.info/sct?fhir_vs';
const COUNTS = [20, 100];

const terms   = loadPool('snomed/filter-terms.json');
const request = (filter) => {
  const count = COUNTS[Math.floor(Math.random() * COUNTS.length)];
  return ValueSet_expand_GET({ url: SNOMED_VS, filter, count });
};

// ─── Benchmark ────────────────────────────────────────────────────────────

export default runTest({
  pool: terms,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────

export const preflight = {
  id: 'EX03',
  knownEntry: 'diabetes',
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'has results':   (r) => (r.json()?.expansion?.contains?.length ?? 0) > 0,
  },
};
