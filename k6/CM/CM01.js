// ConceptMap/$translate — SNOMED implicit REPLACED BY map
// Pool entries: { url, system, code, target }
// url = http://snomed.info/sct?fhir_cm=900000000000526001
// Requires a server with SNOMED CT loaded and implicit ConceptMap support.
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ConceptMap_translate_GET } from '../lib/fhir.js';
import { loadPool } from '../lib/pool.js';

const entries = loadPool('conceptmap/snomed-replacedby.json');

const request = ({ url, system, code, target }) =>
  ConceptMap_translate_GET({ url, system, code, targetSystem: target });

// ─── Benchmark ────────────────────────────────────────────────────────────

export default runTest({
  pool: entries,
  request,
  checks: {
    'status 200':  (r) => r.status === 200,
    'result true': (r) => r.json()?.parameter?.find(p => p.name === 'result')?.valueBoolean === true,
  },
});

// ─── Preflight ────────────────────────────────────────────────────────────

// 225983005 (Duodenal ulcer NOS) → replaced by 40845000 (Duodenal ulcer)
const KNOWN_ENTRY = {
  url:    'http://snomed.info/sct?fhir_cm=900000000000526001',
  system: 'http://snomed.info/sct',
  code:   '225983005',
  target: 'http://snomed.info/sct',
};

export const preflight = {
  id: 'CM01',
  knownEntry: KNOWN_ENTRY,
  request,
  checks: {
    'status 200':  (r) => r.status === 200,
    'result true': (r) => r.json()?.parameter?.find(p => p.name === 'result')?.valueBoolean === true,
  },
};
