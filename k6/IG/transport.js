// Reconstruct the FHIR wire request for either cache mode.
function expand(body, assets, supplied) {
  if (!body) return null;
  return {
    ...body,
    parameter: (body.parameter || []).map((p) => {
      if (p.asset) {
        supplied.push(p.asset);
        return { name: p.name, resource: assets(p.asset) };
      }
      if (p.resource?.resourceType === 'Parameters')
        return { ...p, resource: expand(p.resource, assets, supplied) };
      return p;
    }),
  };
}
const types = {
  url: 'valueUri',
  system: 'valueUri',
  code: 'valueCode',
  valueSetVersion: 'valueString',
  version: 'valueString',
  inferSystem: 'valueBoolean',
  displayLanguage: 'valueCode',
  'default-to-latest-version': 'valueBoolean',
  'system-version': 'valueCanonical',
  diagnostics: 'valueBoolean',
  'lenient-display-validation': 'valueBoolean',
  includeDesignations: 'valueBoolean',
  'profile-url': 'valueCanonical',
  'default-canonical-version': 'valueCanonical',
};
export function wire(spec, assets, known) {
  const supplied = [];
  let body = expand(spec.body, assets, supplied),
    method = spec.method,
    query = spec.query;
  const extra = spec.context.filter((id) => !known?.has(id) && !supplied.includes(id));
  if (extra.length && method === 'GET') {
    if (!spec.route.includes('$')) throw new Error('Cannot attach context to a search');
    const params = [];
    for (const [name, value] of query) {
      if (name === '_format') continue;
      const type = types[name];
      if (!type || (type === 'valueBoolean' && !['true', 'false'].includes(value)))
        throw new Error('Unsupported GET parameter ' + name);
      params.push({ name, [type]: type === 'valueBoolean' ? value === 'true' : value });
    }
    query = [];
    method = 'POST';
    body = { resourceType: 'Parameters', parameter: params };
  }
  for (const id of extra) {
    body.parameter.push({ name: 'tx-resource', resource: assets(id) });
    supplied.push(id);
  }
  const suffix = query.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  return { method, path: spec.route + (suffix ? '?' + suffix : ''), body, supplied };
}
