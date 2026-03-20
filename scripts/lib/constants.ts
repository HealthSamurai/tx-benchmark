export const PROM_URL  = 'http://localhost:9090';
export const PUSH_URL  = 'http://localhost:9091';
export const VU_LEVELS = [1, 10, 50] as const;

// Imputation percentile — used with a 0 floor prepended to the participant pool.
// See METHODOLOGY.md for the full imputation algorithm.
export const IMPUTE_PERCENTILE = 30;

export const TESTS = [
  'k6/FS/FS01.js',
  'k6/LK/LK01.js',
  'k6/LK/LK02.js',
  'k6/LK/LK03.js',
  'k6/LK/LK04.js',
  'k6/LK/LK05.js',
  'k6/VC/VC01.js',
  'k6/VC/VC02.js',
  'k6/VC/VC03.js',
  'k6/EX/EX01.js',
  'k6/EX/EX02.js',
  'k6/EX/EX03.js',
  'k6/EX/EX04.js',
  'k6/EX/EX05.js',
  'k6/EX/EX06.js',
  'k6/EX/EX07.js',
  'k6/EX/EX08.js',
  'k6/SS/SS01.js',
  'k6/CM/CM01.js',
  'k6/CM/CM02.js',
] as const;

export type TestPath = typeof TESTS[number];
export type TestId   = string; // e.g. 'LK01'

export const TEST_IDS = TESTS.map(t => t.split('/').pop()!.replace('.js', ''));
