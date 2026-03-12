import { check } from 'k6';
import http from 'k6/http';
import { BASE_URL } from './config.js';

const DEFAULT_HEADERS = {
  'Accept': 'application/fhir+json',
};

/**
 * Returns a k6 default function that picks a random entry from pool,
 * builds a request, executes it, and runs checks.
 *
 * VU count and duration are set via CLI flags, not here.
 */
export function runTest({ pool, request, checks }) {
  return function () {
    const entry = pool[Math.floor(Math.random() * pool.length)];
    const { path, method = 'GET', body = null, headers = {} } = request(entry);

    const params = { headers: { ...DEFAULT_HEADERS, ...headers } };
    const url = `${BASE_URL}${path}`;

    const res = method === 'POST'
      ? http.post(url, body, params)
      : http.get(url, params);

    check(res, checks);
  };
}
