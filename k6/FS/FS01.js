// FHIR Search — ValueSet and CodeSystem with varied parameters
//
// Pool entries: { resourceType, params }
// Variants:
//   ValueSet?url=:url&_count=10
//   ValueSet?_count=N
//   CodeSystem?_count=N
//   CodeSystem?url=:url&version=:version
//   CodeSystem?content=complete&url=http://snomed.info/sct
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { search } from '../lib/fhir.js';
import { isBundle } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

const KNOWN_ENTRY = {
  resourceType: 'ValueSet',
  params: { url: 'http://hl7.org/fhir/ValueSet/administrative-gender' },
};

const requests = loadPool('fhir-search/requests.json');
const request  = ({ resourceType, params }) => search(resourceType, params);

// ─── Benchmark ────────────────────────────────────────────────────────────

export default runTest({
  pool: requests,
  request,
  checks: {
    'status 200': (r) => r.status === 200,
    'is Bundle':  (r) => isBundle(r),
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────

export const preflight = {
  id: 'FS01',
  knownEntry: KNOWN_ENTRY,
  request,
  checks: {
    'status 200': (r) => r.status === 200,
    'is Bundle':  (r) => isBundle(r),
    'has entry':  (r) => r.json()?.entry?.length > 0,
  },
};
