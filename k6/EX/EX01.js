// ValueSet/$expand — SNOMED implicit ValueSet at varying counts (10, 100, 1000)
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_expand_GET } from '../lib/fhir.js';
import { isValueSetExpansion } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const SNOMED_VS = 'http://snomed.info/sct?fhir_vs';

const counts  = loadPool('expand/counts.json');
const request = (count) => ValueSet_expand_GET({ url: SNOMED_VS, count });

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
  id: 'EX01',
  knownEntry: 10,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'correct count': (r) => r.json()?.expansion?.contains?.length === 10,
  },
};
