import { SharedArray } from 'k6/data';

/**
 * Loads a pool file as a SharedArray (shared across VUs, not copied per VU).
 * Pass a path relative to the pools/ directory: e.g. 'snomed/codes.json'.
 *
 * ../pools/ resolves to k6/pools/ from both lib/ and any test category folder
 * (LK/, VC/, etc.), so path resolution is consistent under current and future k6.
 *
 * Must be called at the top level (init context), not inside a function.
 */
export function loadPool(name) {
  return new SharedArray(name, () => JSON.parse(open(`../pools/${name}`)));
}
