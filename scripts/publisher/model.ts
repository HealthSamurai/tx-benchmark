import { digest } from './transcript';

export const systems = {
  snomed: 'http://snomed.info/sct',
  loinc: 'http://loinc.org',
  rxnorm: 'http://www.nlm.nih.gov/research/umls/rxnorm',
};
export const pins: Record<string, string> = {
  '900000000000207008': systems.snomed + '/900000000000207008/version/20260201',
  '731000124108': systems.snomed + '/731000124108/version/20260301',
  [systems.loinc]: '2.82',
  [systems.rxnorm]: '03022026',
};
export function group(uri: string) {
  if (uri === systems.snomed || uri.startsWith(systems.snomed + '/') || uri.startsWith(systems.snomed + '?'))
    return 'snomed';
  if (uri === systems.loinc || uri.startsWith(systems.loinc + '/')) return 'loinc';
  if (uri === systems.rxnorm) return 'rxnorm';
  if (uri === 'http://unitsofmeasure.org') return 'ucum';
  if (uri.startsWith('urn:ietf:bcp:')) return 'bcp';
  if (/^https?:\/\/(?:terminology\.)?hl7\.org\/fhir\//.test(uri)) return 'hl7';
  return 'other';
}
export function visit(x: any, accept: (x: any) => void) {
  if (!x || typeof x !== 'object') return;
  if (!Array.isArray(x)) accept(x);
  for (const child of Object.values(x)) visit(child, accept);
}
export function systemUris(body: any, query: URLSearchParams, operation: string) {
  const uris = new Set<string>();
  function uri(s: unknown) {
    if (typeof s === 'string') uris.add(s.split('|')[0]);
  }
  function input(name: string, value: unknown) {
    if (name === 'system' || (name === 'url' && operation === 'CodeSystem')) uri(value);
    if (name === 'url' && typeof value === 'string' && value.includes('?fhir_vs')) uri(value.split('?')[0]);
  }
  for (const [k, v] of query) input(k, v);
  visit(body, (o) => {
    if (typeof o.system === 'string' && /^(https?:|urn:)/.test(o.system)) uri(o.system);
    if (o.name) input(o.name, o.valueUri ?? o.valueCanonical);
    if (o.resourceType === 'CodeSystem') uri(o.url);
  });
  return [...uris].sort();
}
export function resourceIsPortable(r: any) {
  // Include generated implicit selectors, and artifacts explicitly marked CC0.
  // Keep bulky or rights-ambiguous third-party definitions content-addressed.
  if (/^(CC0-1\.0|CC0)$/i.test((r.copyright || '').trim())) return true;
  const allowed = (o: any, keys: string[]) =>
    !!o && typeof o === 'object' && Object.keys(o).every((k) => keys.includes(k));
  if (
    r.resourceType !== 'ValueSet' ||
    !allowed(r, ['resourceType', 'id', 'url', 'name', 'version', 'status', 'compose']) ||
    !allowed(r.compose, ['include', 'exclude', 'inactive', 'lockedDate']) ||
    !r.compose.include?.length
  )
    return false;
  return [...r.compose.include, ...(r.compose.exclude || [])].every(
    (i) =>
      allowed(i, ['system', 'version', 'valueSet', 'filter', 'concept']) &&
      (typeof i.system === 'string' || i.valueSet?.length) &&
      (i.filter || []).every(
        (f: any) =>
          allowed(f, ['property', 'op', 'value']) && typeof f.value === 'string' && f.value.length <= 512
      ) &&
      (i.concept || []).length <= 20 &&
      (i.concept || []).every((c: any) => allowed(c, ['code']) && typeof c.code === 'string')
  );
}
export function parameters(body: any, store: (r: any) => string) {
  if (body?.resourceType !== 'Parameters') throw new Error('non-Parameters input');
  const result = [];
  for (const p of body.parameter || []) {
    if (p.name === 'x-system-cache-id' || p.name === 'cache-id') continue;
    if (p.resource) {
      if (p.name === 'validation' && p.resource.resourceType === 'Parameters')
        result.push({ ...p, resource: parameters(p.resource, store) });
      else if (['ConceptMap', 'ValueSet', 'CodeSystem'].includes(p.resource.resourceType))
        result.push({ name: p.name, asset: store(p.resource) });
      else throw new Error('unsupported inline resource');
    } else {
      const keys = Object.keys(p);
      if (
        !keys.every(
          (k) =>
            k === 'name' ||
            /^value(?:Boolean|Integer|String|Code|Uri|Canonical|Coding|CodeableConcept|DateTime|Id|UnsignedInt|PositiveInt|Date)$/.test(
              k
            )
        )
      )
        throw new Error('unsupported parameter shape');
      if (!/^[\w-]+$/.test(p.name) || /password|token|secret/i.test(p.name))
        throw new Error('unsupported parameter name');
      result.push(p);
    }
  }
  return { resourceType: 'Parameters', parameter: result };
}
export function references(body: any, query: URLSearchParams) {
  const found = new Set<string>();
  const add = (s: unknown) => {
    if (typeof s === 'string' && /^(?:https?:|urn:)/.test(s)) found.add(s);
  };
  function scan(o: any) {
    if (typeof o.system === 'string' && typeof o.version === 'string') add(o.system + '|' + o.version);
    for (const k of ['system', 'supplements', 'valueSet', 'sourceCanonical', 'targetCanonical']) {
      if (k === 'system' && o.version) continue;
      if (Array.isArray(o[k])) o[k].forEach(add);
      else add(o[k]);
    }
    if (o.resourceType === 'Parameters') {
      const ps = o.parameter || [];
      const v = ps.find((p: any) => p.name === 'valueSetVersion')?.valueString;
      const u = ps.find((p: any) => p.name === 'url')?.valueUri;
      if (u && v) add(u + '|' + v);
    }
    if (o.name && !['system-version', 'default-canonical-version', 'profile-url'].includes(o.name))
      add(o.valueUri ?? o.valueCanonical ?? o.valueUrl);
  }
  visit(body, scan);
  for (const key of ['url', 'system', 'valueSet']) query.getAll(key).forEach(add);
  for (const uri of found) if (uri.includes('|')) found.delete(uri.split('|')[0]);
  return [...found];
}
export function remember(map: Map<string, string>, r: any, id: string) {
  if (!r.url) return;
  map.set(r.url, id);
  if (r.version) map.set(r.url + '|' + r.version, id);
}
export function context(map: Map<string, string>, refs: string[], own: string[], assets: Map<string, any>) {
  const seen = new Set(own),
    out: string[] = [];
  for (const ref of refs) {
    const id = map.get(ref);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    refs.push(...assets.get(id).refs);
  }
  return out.sort();
}
export const resourceId = digest;
