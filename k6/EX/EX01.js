// ValueSet/$expand — SNOMED Clinical Finding hierarchy (is-a 404684003), varying counts and offsets
// Pool entries: { count, offset? }
// count sweep: 10, 100, 1000 (offset=0)
// pagination sweep: count=10 at offsets 100, 1000, 10000, 50000
// Uses a large subtree (~380k concepts) rather than full SNOMED to avoid too-costly rejections.
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ValueSet_expand_GET } from '../lib/fhir.js';
import { isValueSetExpansion } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

// Clinical finding (404684003) — large enough to stress pagination, accepted by all major servers.
const SNOMED_VS = 'http://snomed.info/sct?fhir_vs=isa/404684003';

const entries = loadPool('expand/counts.json');
const request = ({ count, offset }) => ValueSet_expand_GET({ url: SNOMED_VS, count, offset });

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
  knownEntry: { count: 10 },
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'has expansion': (r) => isValueSetExpansion(r),
    'correct count': (r) => r.json()?.expansion?.contains?.length === 10,
  },
};
