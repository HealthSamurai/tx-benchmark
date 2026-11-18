// Materialize an eligible workload locally so k6 only measures HTTP replay.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readPool, digest } from './transcript';
import { ucumProbe } from '../../k6/IG/answers.js';
import { coreProfile } from './profile';
import { visit } from './model';

const [pool, out] = Bun.argv.slice(2);
if (!pool || !out) throw new Error('Usage: bun scripts/publisher/prepare.ts POOL OUTPUT');
const manifest = await Bun.file(join(pool, 'manifest.json')).json();
if (manifest.format !== 1) throw new Error('Unknown corpus format');
const [requests, builds, assets, external] = await Promise.all(
  ['requests', 'builds', 'assets', 'external'].map((name) => readPool(pool, manifest.hashes, name))
);
if (process.env.ASSETS) {
  const extra = JSON.parse(gunzipSync(await readFile(process.env.ASSETS)).toString());
  const known = new Set(external.map((r: any) => r.id));
  for (const [id, resource] of Object.entries(extra)) {
    if (!known.has(id) || digest(resource) !== id)
      throw new Error('Unrecognized asset or invalid digest ' + id);
    assets[id] = resource;
  }
}
const profile = process.env.PROFILE || 'observed';
if (!['observed', 'core'].includes(profile)) throw new Error('PROFILE must be observed or core');
if (
  process.env.SNOMED_EDITIONS &&
  (profile !== 'core' || !['international', 'international,us'].includes(process.env.SNOMED_EDITIONS))
)
  throw new Error('SNOMED_EDITIONS requires core and accepts international or international,us');
const csv = (s?: string) =>
  new Set(
    s
      ?.split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  );
const groups = csv(process.env.GROUPS_ALLOWED),
  uris = csv(process.env.SYSTEMS_ALLOWED);
const packages = csv(process.env.PACKAGES),
  releases = csv(process.env.RELEASES);
const reviewed = process.env.REVIEWED ? await Bun.file(process.env.REVIEWED).json() : {};
const usedAssets: Record<string, any> = {},
  rows: any[] = [],
  traces: any[] = [],
  indexes = new Map<number, any>();
const exclusions: Record<string, number> = {},
  byRoute: Record<string, number> = {},
  byGroup: Record<string, number> = {};
let count = 0,
  independentUcum = 0,
  sessionCalls = 0,
  scorable = 0,
  changed = 0,
  complete = 0,
  sourceComplete = 0,
  eligibleBuilds = 0;
function prepare(id: number) {
  const original = requests[id];
  if (!original) throw new Error('Invalid request index');
  if (groups.size && original.groups.some((g: string) => !groups.has(g))) return 'outside groups';
  if (
    uris.size &&
    (original.groups.includes('unresolved') || original.systems.some((s: string) => !uris.has(s)))
  )
    return 'outside systems';
  if (releases.size && !releases.has(original.release)) return 'outside FHIR releases';
  if (!original.route.includes('$') && original.context.length) return 'stateful search';
  const needed = new Set<string>(original.context);
  visit(original.body, (o) => {
    if (o.asset) needed.add(o.asset);
  });
  for (const asset of needed) if (!(asset in assets)) return 'missing asset';
  let spec = original,
    modified = false;
  if (profile === 'core') {
    try {
      ({ spec, changed: modified } = coreProfile(original, process.env.SNOMED_EDITIONS === 'international'));
    } catch (e) {
      return (e as Error).message;
    }
  }
  for (const asset of needed) usedAssets[asset] = assets[asset];
  const index = rows.length;
  const fingerprint = digest(spec);
  const reference = reviewed[fingerprint];
  if (
    reference &&
    (!Number.isInteger(reference.status) ||
      reference.status < 200 ||
      reference.status > 299 ||
      !['validation', 'expansion', 'lookup', 'subsumption', 'batch', 'search'].includes(reference.kind) ||
      !/^[a-f0-9]{64}$/.test(reference.digest) ||
      !reference.source)
  )
    throw new Error('Invalid reviewed answer ' + fingerprint);
  rows.push({ ...spec, fingerprint });
  return { index, modified, reference };
}
for (const build of builds) {
  const events = [];
  for (const [seq, id, slot, status, kind, expected] of build.calls) {
    let result;
    if (packages.size && !packages.has(build.package)) result = 'outside packages';
    else {
      if (!indexes.has(id)) indexes.set(id, prepare(id));
      result = indexes.get(id);
    }
    if (typeof result === 'string') {
      exclusions[result] = (exclusions[result] || 0) + 1;
      continue;
    }
    const spec = rows[result.index];
    const recorded = [status, kind, expected];
    const ref = result.reference;
    const answer = ref
      ? [ref.status, ref.kind, ref.digest]
      : result.modified
      ? [0, 'unreviewed', null]
      : recorded;
    if (answer[0] >= 200 && answer[0] < 300 && answer[2] && answer[1] !== 'issue') scorable++;
    if (result.modified) changed++;
    if (ucumProbe(spec)) independentUcum++;
    if (slot !== null) sessionCalls++;
    count++;
    byRoute[spec.route] = (byRoute[spec.route] || 0) + 1;
    const group = spec.groups.join('+');
    byGroup[group] = (byGroup[group] || 0) + 1;
    events.push([seq, result.index, slot, ...answer]);
  }
  if (!events.length) continue;
  eligibleBuilds++;
  if (events.length === build.calls.length) {
    complete++;
    if (Object.entries(build.skipped).every(([k]) => ['session control', 'capability discovery'].includes(k)))
      sourceComplete++;
  }
  traces.push({ package: build.package, events });
}
const coverage = {
  week: manifest.week,
  profile,
  selectedPackages: manifest.selected,
  captured: manifest.captured,
  observed: manifest.observed,
  compiled: manifest.included,
  eligible: count,
  sessionCalls,
  independentUcum,
  scorable,
  changed,
  participatingBuilds: eligibleBuilds,
  allCompiledCallsInBuild: complete,
  allSourceDataCallsInBuild: sourceComplete,
  exclusions,
  byRoute,
  byGroup,
};
if (!count) throw new Error('No eligible calls: ' + JSON.stringify(coverage));
await mkdir(out, { recursive: true });
// A single atomic file couples the pools to the counted mix consumed by k6.
const file = join(out, 'workload.json');
const tmp = file + '.' + process.pid + '.tmp';
await writeFile(tmp, JSON.stringify({ coverage, requests: rows, assets: usedAssets, traces }));
await rename(tmp, file);
console.log(JSON.stringify(coverage, null, 2));
