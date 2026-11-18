// Opt-in weekly IG Publisher workload. See scripts/publisher/README.md.
import http from 'k6/http';
import exec from 'k6/execution';
import crypto from 'k6/crypto';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { answer, stable, ucumProbe } from './answers.js';
import { wire } from './transport.js';

const mode = __ENV.MODE || 'stateless';
if (!['stateless', 'session'].includes(mode)) throw new Error('Invalid MODE');
const file = __ENV.WORKLOAD || '../../results/IG/workload.json';
const read = () => JSON.parse(open(file));
const requests = new SharedArray('publisher requests', () => read().requests);
const traces = new SharedArray('publisher traces', () => read().traces);
const assets = new SharedArray('publisher assets', () => Object.values(read().assets));
const keys = new SharedArray('publisher asset keys', () => Object.keys(read().assets));
const positions = new Map(keys.map((key, i) => [key, i]));
const asset = (id) => assets[positions.get(id)];
const coverage = new SharedArray('publisher coverage', () => [read().coverage])[0];
const vus = Number(__ENV.VUS || 1),
  repeats = Number(__ENV.REPEATS || 1);
if (![vus, repeats].every((v) => Number.isSafeInteger(v) && v > 0))
  throw new Error('Expected positive integer VUS and REPEATS');
const targetCount = coverage.eligible * repeats;
export const options = {
  scenarios: {
    publisher: {
      executor: 'shared-iterations',
      vus,
      iterations: traces.length * repeats,
      maxDuration: __ENV.MAX_DURATION || '8h',
      gracefulStop: '1m',
    },
  },
  summaryTrendStats: ['min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    publisher_attempts: ['count==' + targetCount],
    publisher_completed_builds: ['count==' + traces.length * repeats],
    ...(coverage.independentUcum ? { publisher_ucum_membership: ['rate==1'] } : {}),
    ...(coverage.scorable ? { publisher_reference_match: ['rate==1'] } : {}),
    ...(mode === 'session' && coverage.sessionCalls ? { publisher_session_control_ok: ['rate==1'] } : {}),
  },
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
};
const attempts = new Counter('publisher_attempts'),
  completed = new Counter('publisher_completed_builds');
const correct = new Rate('publisher_reference_match'),
  unscored = new Counter('publisher_unscored');
const matchedMs = new Trend('publisher_matching_ms', true),
  mismatchMs = new Trend('publisher_mismatch_ms', true);
const operationMs = new Trend('publisher_operation_ms', true),
  buildMs = new Trend('publisher_build_ms', true);
const membership = new Rate('publisher_ucum_membership');
const controls = new Rate('publisher_session_control_ok');
function endpoint(release) {
  const value = __ENV['BASE_' + release.replace('.', '_')] || __ENV.BASE_URL;
  if (!value || !/^https?:\/\//.test(value))
    throw new Error('Set BASE_' + release.replace('.', '_') + ' or BASE_URL');
  return value.replace(/\/$/, '');
}
export function setup() {
  const byRelease = new Set();
  for (const spec of requests) byRelease.add(spec.release);
  for (const r of byRelease) endpoint(r);
  if (byRelease.size > 1 && [...byRelease].some((r) => !__ENV['BASE_' + r.replace('.', '_')]))
    throw new Error(
      'Multiple FHIR releases selected: configure BASE_3_0, BASE_4_0, BASE_5_0 as applicable, or prepare with RELEASES'
    );
  console.log(JSON.stringify({ mode, repeats, ...coverage }));
}
function send(base, release, method, path, body, id, name) {
  const media = 'application/fhir+json; fhirVersion=' + release;
  const headers = { Accept: media, 'Content-Type': media };
  if (id) headers['X-Cache-Id'] = id;
  return http.request(method, base + '/' + path, body === null ? null : JSON.stringify(body), {
    headers,
    redirects: 0,
    timeout: __ENV.HTTP_TIMEOUT || '60s',
    tags: { name },
  });
}
function json(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}
export default function () {
  const build = traces[exec.scenario.iterationInTest % traces.length];
  const sessions = new Map(),
    started = Date.now();
  try {
    for (const [seq, index, slot, status, kind, expected] of build.events) {
      const spec = requests[index],
        base = endpoint(spec.release);
      const tags = { mode, operation: spec.route, release: spec.release, group: spec.groups.join('+') };
      const scored = status >= 200 && status < 300 && !!expected && kind !== 'issue';
      attempts.add(1, tags);
      let session;
      if (mode === 'session' && slot !== null) {
        if (!sessions.has(slot)) {
          const r = send(
            base,
            spec.release,
            'POST',
            '$cache-control?mode=start',
            { resourceType: 'Parameters', parameter: [{ name: 'sealed', valueBoolean: false }] },
            null,
            'cache start'
          );
          const id =
            json(r)?.parameter?.find((p) => p.name === 'cache-id')?.valueId || r.headers['X-Cache-Id'];
          const ok = r.status >= 200 && r.status < 300 && !!id;
          controls.add(ok, { mode, action: 'start' });
          sessions.set(slot, {
            id: ok ? id : null,
            base,
            release: spec.release,
            known: new Set(),
            latest: new Map(),
          });
        }
        session = sessions.get(slot);
      }
      if (session && !session.id) {
        if (ucumProbe(spec)) membership.add(false, tags);
        if (scored) correct.add(false, tags);
        else unscored.add(1, tags);
        continue;
      }
      const req = wire(spec, asset, session?.known);
      const r = send(base, spec.release, req.method, req.path, req.body, session?.id, spec.route);
      operationMs.add(r.timings.duration, tags);
      if (session && r.status >= 200 && r.status < 300)
        for (const id of req.supplied) {
          const key = asset(id).url;
          if (key && session.latest.has(key)) session.known.delete(session.latest.get(key));
          if (key) session.latest.set(key, id);
          session.known.add(id);
        }
      const probe = ucumProbe(spec);
      if (!scored && !probe) {
        unscored.add(1, tags);
        continue;
      }
      const op = spec.route.split('/')[1] || 'search';
      const projection = answer(op, json(r));
      if (probe)
        membership.add(r.status === 200 && projection?.[0] === 'validation' && projection[1] === true, tags);
      if (!scored) {
        unscored.add(1, tags);
        continue;
      }
      const actual = projection ? crypto.sha256(JSON.stringify(stable(projection)), 'hex') : null;
      const ok = r.status === status && actual === expected;
      if (!ok && __ENV.LOG_MISMATCH === '1')
        console.warn(
          JSON.stringify({
            package: build.package,
            seq,
            operation: spec.route,
            expectedStatus: status,
            actualStatus: r.status,
            expectedDigest: expected,
            actualDigest: actual,
          })
        );
      check(ok, { 'matches reference answer': (v) => v }, tags);
      correct.add(ok, tags);
      (ok ? matchedMs : mismatchMs).add(r.timings.duration, tags);
    }
    completed.add(1, { mode });
  } finally {
    for (const s of sessions.values())
      if (s.id) {
        const r = send(
          s.base,
          s.release,
          'POST',
          '$cache-control?mode=end',
          { resourceType: 'Parameters' },
          s.id,
          'cache end'
        );
        controls.add(r.status >= 200 && r.status < 300, { mode, action: 'end' });
      }
    buildMs.add(Date.now() - started, { mode });
  }
}
