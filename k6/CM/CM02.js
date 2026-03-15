// ConceptMap/$translate — package ConceptMaps (FHIR R4 core + IPS)
// Pool entries: { url, system, code, target }
// Covers cm-* (FHIR↔v2/v3 crosswalks), sc-* (resource status canonical maps),
// and IPS (LOINC↔SNOMED, absence↔SNOMED, severity mappings).
// Requires hl7.fhir.r4.core and hl7.fhir.uv.ips packages loaded.
import { runTest, handleSummary, options } from '../lib/runner.js';
export { handleSummary, options };
import { ConceptMap_translate_GET } from '../lib/fhir.js';
import { loadPool } from '../lib/pool.js';

const entries = loadPool('conceptmap/cm-packages.json');

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

// male → M (v3 AdministrativeGender) — universally available in R4 core
const KNOWN_ENTRY = {
  url:    'http://hl7.org/fhir/ConceptMap/cm-administrative-gender-v3',
  system: 'http://hl7.org/fhir/administrative-gender',
  code:   'male',
  target: 'http://terminology.hl7.org/CodeSystem/v3-AdministrativeGender',
};

export const preflight = {
  id: 'CM02',
  knownEntry: KNOWN_ENTRY,
  request,
  checks: {
    'status 200':  (r) => r.status === 200,
    'result true': (r) => r.json()?.parameter?.find(p => p.name === 'result')?.valueBoolean === true,
  },
};
