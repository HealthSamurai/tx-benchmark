import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { CodeSystem_lookup_GET } from '../lib/fhir.js';
import { isParameters, hasDisplay, paramMatches } from '../lib/checks.js';
import { loadPool } from '../lib/pool.js';

// Pool entries are [system, code, version] tuples
const tuples = loadPool('fhir-pkg/tuples.json');

const KNOWN_SYSTEM   = 'http://dicom.nema.org/resources/ontology/DCM';
const KNOWN_CODE     = '121054'; // Observer context (well-known DICOM code)
const KNOWN_VERSION  = '01';

const request = ([system, code, version]) => CodeSystem_lookup_GET({ system, code, version });

// ─── Benchmark ────────────────────────────────────────────────────────────

export default runTest({
  pool: tuples,
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'is Parameters': (r) => isParameters(r),
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────

export const preflight = {
  id: 'LK03',
  knownEntry: [KNOWN_SYSTEM, KNOWN_CODE, KNOWN_VERSION],
  request,
  checks: {
    'status 200':    (r) => r.status === 200,
    'is Parameters': (r) => isParameters(r),
    'has display':   (r) => hasDisplay(r),
    'code echoed':   (r) => paramMatches(r, 'code', 'valueCode', KNOWN_CODE, false),
    'system matches':(r) => paramMatches(r, 'system', 'valueUri', KNOWN_SYSTEM, false),
  },
};
