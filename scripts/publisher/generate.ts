// Compile private qa-tx.html captures into deterministic, target-independent k6 pools.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { answer, stable } from '../../k6/IG/answers.js';
import { entries, digest, sha } from './transcript';
import {
  context,
  group,
  parameters,
  references,
  remember,
  systemUris,
  resourceIsPortable,
  visit,
} from './model';

const [capture, out, localAssets] = Bun.argv.slice(2);
if (!capture || !out)
  throw new Error('Usage: bun scripts/publisher/generate.ts CAPTURE OUTPUT [PRIVATE-ASSETS.json.gz]');
const manifest = JSON.parse(await readFile(join(capture, 'manifest.json'), 'utf8'));
const requests: any[] = [],
  requestIds = new Map<string, number>();
const resources = new Map<string, any>(),
  assets: Record<string, any> = {},
  external: Record<string, any> = {};
const observedOperations: Record<string, number> = {};
const builds: any[] = [],
  exclusions: Record<string, number> = {},
  operations: Record<string, number> = {};
const queryKeys = new Set(
  'url _format system version code mode inferSystem displayLanguage default-to-latest-version valueSetVersion diagnostics system-version lenient-display-validation includeDesignations profile-url default-canonical-version'.split(
    ' '
  )
);
const increment = (counts: Record<string, number>, key: string) => (counts[key] = (counts[key] || 0) + 1);
let observed = 0,
  included = 0,
  bundled = 0,
  bundledBuilds = 0,
  referenceAnswers = 0,
  rawAttachmentCalls = 0,
  contextCalls = 0;
for (const source of manifest.builds) {
  if (source.error) continue;
  const calls: any[] = [],
    skipped: Record<string, number> = {},
    byOperation: Record<string, number> = {};
  const lanes = new Map<string, { slot: number; cache: Map<string, string>; opaque: boolean }>();
  const startFlags = new Map<string, boolean>();
  const file = await readFile(join(capture, source.key + '.gz'));
  let selfContained = true,
    seen = 0;
  for (const { req, res, seq } of entries(file, source.sha256)) {
    observed++;
    seen++;
    const skip = (reason: string) => {
      increment(skipped, reason);
      increment(exclusions, reason);
    };
    const [method, raw] = req.first.split(' ');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      increment(observedOperations, 'unreadable');
      increment(byOperation, 'unreadable');
      skip('unreadable request line');
      continue;
    }
    const path = url.pathname.split('/').filter(Boolean);
    const last = path.at(-1) || '',
      resource = last.startsWith('$') ? path.at(-2) : last;
    const observedRoute =
      last.startsWith('$') && ['CodeSystem', 'ValueSet', 'ConceptMap'].includes(resource || '')
        ? resource + '/' + last
        : last.startsWith('$') || last === 'metadata' || ['CodeSystem', 'ValueSet'].includes(last)
        ? last
        : ['CodeSystem', 'ValueSet'].includes(path.at(-2) || '')
        ? path.at(-2) + '/read'
        : 'other';
    increment(byOperation, observedRoute);
    increment(observedOperations, observedRoute);
    const release =
      /fhirVersion=(\d+\.\d+)/i.exec(req.headers.accept || req.headers['content-type'] || '')?.[1] ||
      ({ r3: '3.0', r4: '4.0', r4b: '4.3', r5: '5.0' } as any)[
        path.find((s) => /^r[345]b?$/i.test(s))?.toLowerCase() || ''
      ];
    const prefix =
      url.origin +
      '/' +
      path.slice(0, last.startsWith('$') && !['$cache-control'].includes(last) ? -2 : -1).join('/');
    const legacy = (req.body?.parameter || []).find((p: any) => p.name === 'cache-id');
    const sid =
      req.headers['x-cache-id'] || legacy?.valueString || legacy?.valueId || url.searchParams.get('cache-id');
    const laneKey = (id: string) => JSON.stringify([prefix, release, id]);
    if (last === '$cache-control') {
      const mode = url.searchParams.get('mode');
      if (mode === 'start') {
        const id =
          res.headers['x-cache-id'] || res.body?.parameter?.find((p: any) => p.name === 'cache-id')?.valueId;
        if (id)
          startFlags.set(
            laneKey(id),
            req.body?.parameter?.some((p: any) => p.name === 'sealed' && p.valueBoolean === true) || false
          );
      }
      skip('session control');
      continue;
    }
    if (last === 'metadata') {
      skip('capability discovery');
      continue;
    }
    if (
      !['CodeSystem', 'ValueSet'].includes(resource || '') ||
      !(
        last === resource ||
        ['$expand', '$lookup', '$validate-code', '$batch-validate-code', '$subsumes'].includes(last)
      )
    ) {
      skip('nonportable route or resource id');
      continue;
    }
    if (!['GET', 'POST'].includes(method) || !release) {
      skip('unknown transport or FHIR release');
      continue;
    }
    const op = last === resource ? 'search' : last;
    const route = op === 'search' ? resource! : resource + '/' + op;
    let lane;
    if (sid) {
      const key = laneKey(sid);
      if (!lanes.has(key)) lanes.set(key, { slot: lanes.size, cache: new Map(), opaque: false });
      lane = lanes.get(key)!;
      if (startFlags.get(key)) {
        skip('sealed source session');
        continue;
      }
    }
    if (req.invalid || (method === 'POST' && !req.body)) {
      if (lane) lane.opaque = true;
      skip('missing or truncated request');
      continue;
    }
    const q = new URLSearchParams(url.searchParams);
    q.delete('x-system-cache-id');
    q.delete('cache-id');
    const own: string[] = [];
    function put(r: any) {
      const id = digest(r);
      own.push(id);
      if (!resources.has(id)) {
        const portable = resourceIsPortable(r);
        resources.set(id, {
          id,
          type: r.resourceType,
          url: r.url,
          version: r.version,
          refs: references(r, new URLSearchParams()),
          portable,
          source: [source.package, seq],
        });
        (portable ? assets : external)[id] = r;
      }
      return id;
    }
    let body;
    try {
      body = req.body ? parameters(req.body, put) : null;
    } catch {
      if (lane) lane.opaque = true;
      skip('unsupported request payload');
      continue;
    }
    const refs = references(req.body, q);
    const ctx = lane ? context(lane.cache, refs, own, resources) : [];
    // A resource later replaced at the same canonical must keep its original occurrence.
    if (lane) for (const id of own) remember(lane.cache, resources.get(id), id);
    if ([...q.keys()].some((k) => !queryKeys.has(k))) {
      skip('unsupported query parameter');
      continue;
    }
    if (lane?.opaque) {
      skip('incomplete session history');
      continue;
    }
    const deps = [...new Set([...own, ...ctx])];
    const ready = deps.every((id) => resources.get(id).portable);
    if (ready) bundled++;
    else selfContained = false;
    const systems = new Set(systemUris(req.body, q, resource!));
    // The recorded semantic response can identify systems hidden behind a canonical.
    const observedSystems = (b: any) => {
      for (const p of b?.parameter || []) {
        if (p.name === 'system' && p.valueUri) systems.add(p.valueUri);
        if (p.name === 'validation') observedSystems(p.resource);
      }
      visit(b?.expansion?.contains, (o) => {
        if (typeof o.system === 'string') systems.add(o.system);
      });
    };
    observedSystems(res.body);
    for (const id of ctx)
      for (const uri of systemUris(assets[id] || external[id], new URLSearchParams(), resource!))
        systems.add(uri);
    const families = new Set([...systems].map(group));
    if (!families.size) families.add('unresolved');
    const spec = {
      method,
      route,
      release,
      query: [...q],
      body,
      context: ctx,
      groups: [...families].sort(),
      systems: [...systems].sort(),
      bundled: ready,
    };
    const key = digest(spec);
    let index = requestIds.get(key);
    if (index === undefined) {
      index = requests.length;
      requestIds.set(key, index);
      requests.push(spec);
    }
    const status = Number(res.first) || 0;
    const projection = answer(op, res.body);
    const kind = projection?.[0] || 'unavailable';
    const expected = projection ? digest(projection) : null;
    const scorable = status >= 200 && status < 300 && !!expected && kind !== 'issue';
    if (scorable) referenceAnswers++;
    calls.push([seq, index, lane?.slot ?? null, status, kind, expected]);
    if (own.length) rawAttachmentCalls++;
    if (ctx.length) contextCalls++;
    included++;
    increment(operations, route);
  }
  builds.push({ package: source.package, observed: seen, byOperation, skipped, calls });
  if (selfContained && calls.length) bundledBuilds++;
}
await mkdir(out, { recursive: true });
async function compressed(name: string, payload: unknown) {
  const bytes = gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
  await writeFile(join(out, name + '.json.gz'), bytes);
  return sha(bytes);
}
const hashes: Record<string, string> = {};
for (const [name, data] of Object.entries({ requests, builds, assets }))
  hashes[name] = await compressed(name, data);
const omitted = [...resources.values()]
  .filter((x) => !x.portable)
  .map(({ id, type, url, version, source }) => ({ id, type, url, version, source }));
hashes.external = await compressed('external', omitted);
if (localAssets) await writeFile(localAssets, gzipSync(Buffer.from(JSON.stringify(external)), { level: 9 }));
const report = {
  format: 1,
  week: [manifest.start, manifest.end],
  policy: 'latest observed build per package',
  indexUrl: manifest.indexUrl,
  indexSha256: manifest.indexSha256,
  indexEntries: manifest.indexEntries,
  windowEntries: manifest.windowEntries,
  selected: manifest.builds.length,
  captured: builds.length,
  observed,
  included,
  bundled,
  bundledBuilds,
  distinctRequests: requests.length,
  referenceAnswers,
  rawAttachmentCalls,
  contextCalls,
  observedOperations,
  operations,
  exclusions,
  bundledResources: Object.keys(assets).length,
  externalResources: omitted.length,
  hashes,
  sources: manifest.builds.map(({ key, ...rest }: any) => rest),
};
await writeFile(join(out, 'manifest.json'), JSON.stringify(stable(report), null, 2) + '\n');
console.log(
  JSON.stringify({
    observed,
    included,
    bundled,
    bundledBuilds,
    distinct: requests.length,
    referenceAnswers,
    rawAttachmentCalls,
    contextCalls,
    operations,
    exclusions,
    external: omitted.length,
  })
);
