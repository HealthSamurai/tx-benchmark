/**
 * Response check helpers. Each takes a k6 Response and returns boolean.
 *
 * Benchmark tests: lightweight liveness checks (status + resourceType).
 * Preflight:       full semantic checks (correct values, expected structure).
 */

// ─── Liveness (benchmark) ─────────────────────────────────────────────────

export function isParameters(r) {
  try { return r.json()?.resourceType === 'Parameters'; } catch { return false; }
}

export function isValueSet(r) {
  try { return r.json()?.resourceType === 'ValueSet'; } catch { return false; }
}

export function isBundle(r) {
  try { return r.json()?.resourceType === 'Bundle'; } catch { return false; }
}

// ─── Semantic (preflight) ─────────────────────────────────────────────────

export function hasDisplay(r) {
  return stringParam(r, 'display')?.length > 0;
}

export function validationResult(r) {
  return boolParam(r, 'result');
}

export function paramMatches(r, name, key, expected, required = true) {
  const p = param(r, name);
  if (p === null || p === undefined) return !required;
  return p[key] === expected;
}

export function subsumesOutcome(r) {
  // 'subsumes' | 'subsumed-by' | 'equivalent' | 'not-subsumed'
  return param(r, 'outcome')?.valueCode;
}

export function expansionHasContains(r) {
  try { return (r.json()?.expansion?.contains?.length ?? 0) > 0; } catch { return false; }
}

export function translationFound(r) {
  return boolParam(r, 'result');
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function param(r, name) {
  try { return r.json()?.parameter?.find(p => p.name === name); } catch { return null; }
}

function stringParam(r, name) {
  return param(r, name)?.valueString;
}

function boolParam(r, name) {
  return param(r, name)?.valueBoolean;
}
