/**
 * Warmup script — not a benchmark test.
 *
 * Warms JIT compilation and connection pools before measurement.
 * Uses hardcoded codes kept separate from benchmark pools so that
 * server-side caches for benchmark inputs remain cold.
 *
 * Results are discarded (no Prometheus output).
 */
import http from 'k6/http';
import { CodeSystem_lookup_GET, ValueSet_expand_GET } from './lib/fhir.js';

const BASE_URL = __ENV.BASE_URL;
const HEADERS  = { headers: { Accept: 'application/fhir+json' } };
const SNOMED   = 'http://snomed.info/sct';

// Top-level hierarchy concepts — stable, unlikely to appear in benchmark pools
const LOOKUP_CODES = [
  '404684003', // Clinical finding
  '71388002',  // Procedure
  '64572001',  // Disease
  '413350009', // Finding with explicit context
  '243796009', // Situation with explicit context
];

const EXPAND_URLS = [
  'http://snomed.info/sct?fhir_vs=isa/404684003', // Clinical findings (small slice)
];

const OPS = [
  ...LOOKUP_CODES.map(code => () => {
    const { path } = CodeSystem_lookup_GET({ system: SNOMED, code });
    http.get(`${BASE_URL}${path}`, HEADERS);
  }),
  ...EXPAND_URLS.map(url => () => {
    const { path } = ValueSet_expand_GET({ url, count: 10 });
    http.get(`${BASE_URL}${path}`, HEADERS);
  }),
];

export default function () {
  OPS[Math.floor(Math.random() * OPS.length)]();
}
