import { pins, systems, systemUris, visit } from './model';

// Keep national editions separate. An undated edition URI selects that edition.
function pin(system: string, version?: string): string {
  if (system !== systems.snomed) return pins[system] || version || '';
  const match = version && /^http:\/\/snomed\.info\/sct\/(\d+)(?:\/version\/\d{8})?$/.exec(version);
  const edition = version ? match?.[1] : '900000000000207008';
  if (!edition || !pins[edition]) throw new Error('outside core SNOMED editions');
  return pins[edition];
}
function coreSystem(s: unknown): s is string {
  return Object.values(systems).includes(s as string);
}
function verifyControls(spec: any, onlyInternational: boolean) {
  const check = (text: unknown) => {
    if (typeof text !== 'string') return;
    for (const match of text.matchAll(/http:\/\/snomed\.info\/sct\/(\d+)(?:\/version\/(\d{8}))?/g)) {
      if (!pins[match[1]] || pins[match[1]] !== match[0]) throw new Error('outside pinned SNOMED controls');
      if (onlyInternational && match[1] !== '900000000000207008')
        throw new Error('outside International edition');
    }
  };
  for (const [, v] of spec.query) check(v);
  visit(spec.body, (o) => {
    for (const v of Object.values(o)) check(v);
  });
}
export function coreProfile(original: any, onlyInternational = false) {
  const spec = structuredClone(original);
  if (!spec.groups.some((v: string) => ['snomed', 'loinc', 'rxnorm'].includes(v))) {
    verifyControls(spec, onlyInternational);
    return { spec, changed: false };
  }
  if (!spec.route.includes('$')) throw new Error('version-sensitive search');
  if (spec.method === 'GET') throw new Error('version-sensitive GET');
  const q = new URLSearchParams(spec.query);
  if ([...q].some(([k]) => ['system-version', 'version', 'url'].includes(k)))
    throw new Error('version-sensitive query string');
  // Instance lookups and subsumption take a version or versioned Coding. ValueSet
  // operations and validation take system-version defaults for the queried systems.
  const before = JSON.stringify(spec.body);
  function rewrite(body: any, batchRow = false) {
    const ps = body.parameter || [];
    if (ps.some((p: any) => p.name === 'validation')) {
      for (const p of ps) if (p.name === 'validation') rewrite(p.resource, true);
      return;
    }
    const defaults = new Map<string, string>();
    const active = new Set<string>();
    for (const s of batchRow ? systemUris(body, new URLSearchParams(), 'CodeSystem') : spec.systems)
      if (coreSystem(s)) active.add(s);
    for (const p of ps) {
      if (p.name === 'system-version') {
        const field = ['valueCanonical', 'valueString', 'valueUri'].find((k) => typeof p[k] === 'string');
        if (!field) throw new Error('unsupported version parameter');
        const [sys, version] = p[field].split('|');
        if (!active.has(sys)) continue;
        const target = pin(sys, version);
        if (defaults.has(sys) && defaults.get(sys) !== target)
          throw new Error('conflicting edition controls');
        defaults.set(sys, target);
        p[field] = sys + '|' + target;
      }
      if (p.name === 'url' && typeof p.valueUri === 'string' && p.valueUri.startsWith(systems.snomed + '/'))
        throw new Error('version-sensitive implicit value set');
    }
    const codingTargets = new Map<string, string>();
    visit(body, (o) => {
      if (coreSystem(o.system) && (o.code !== undefined || o.version !== undefined)) {
        const target = pin(o.system, o.version || defaults.get(o.system));
        if (codingTargets.has(o.system) && codingTargets.get(o.system) !== target)
          throw new Error('conflicting editions in Coding');
        codingTargets.set(o.system, target);
        if (defaults.has(o.system) && defaults.get(o.system) !== target)
          throw new Error('conflicting edition controls');
        o.version = target;
      }
    });
    const sys =
      ps.find((p: any) => p.name === 'system')?.valueUri ??
      (spec.route.startsWith('CodeSystem') ? ps.find((p: any) => p.name === 'url')?.valueUri : null);
    if (coreSystem(sys)) {
      const name = spec.route.startsWith('ValueSet/') ? 'systemVersion' : 'version';
      const version = ps.find((p: any) => p.name === name);
      const chosen = pin(sys, version?.valueString || defaults.get(sys));
      if (defaults.has(sys) && chosen !== defaults.get(sys)) throw new Error('conflicting edition controls');
      if (version) version.valueString = chosen;
      else ps.push({ name, valueString: chosen });
      active.delete(sys);
    }
    const allowsDefaults = /\$(?:expand|validate-code|batch-validate-code)$/.test(spec.route);
    if (allowsDefaults)
      for (const sys of active) {
        if (!defaults.has(sys))
          ps.push({
            name: 'system-version',
            valueCanonical: sys + '|' + (codingTargets.get(sys) || pin(sys)),
          });
      }
    if (!allowsDefaults)
      for (const s of active) if (!codingTargets.has(s)) throw new Error('unresolved version target');
    body.parameter = ps;
  }
  // A version constraint inside an uploaded resource needs its own reviewed derivative.
  if (spec.context.length || JSON.stringify(spec.body).includes('"asset":'))
    throw new Error('core versioning of attached definitions requires review');
  rewrite(spec.body);
  verifyControls(spec, onlyInternational);
  return { spec, changed: JSON.stringify(spec.body) !== before };
}
