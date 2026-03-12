/**
 * FHIR request builders. Each returns { path, method?, body?, headers? }.
 * runner.js prepends BASE_URL and executes the request.
 *
 * Naming: {ResourceType}_{operation}_{GET|POST}
 * POST builders wrap params in a FHIR Parameters resource.
 */

// ─── CodeSystem/$lookup ────────────────────────────────────────────────────

export function CodeSystem_lookup_GET({ system, code, version, properties = [] }) {
  let path = `/CodeSystem/$lookup?system=${enc(system)}&code=${enc(code)}`;
  if (version) path += `&version=${enc(version)}`;
  for (const p of properties) path += `&property=${enc(p)}`;
  return { path };
}

export function CodeSystem_lookup_POST({ system, code, version, properties = [] }) {
  const params = [
    { name: 'system', valueUri:  system },
    { name: 'code',   valueCode: code },
  ];
  if (version) params.push({ name: 'version', valueString: version });
  for (const p of properties) params.push({ name: 'property', valueCode: p });
  return post('/CodeSystem/$lookup', params);
}

// ─── CodeSystem/$validate-code ─────────────────────────────────────────────

export function CodeSystem_validate_code_GET({ system, code, display, version }) {
  let path = `/CodeSystem/$validate-code?system=${enc(system)}&code=${enc(code)}`;
  if (display) path += `&display=${enc(display)}`;
  if (version) path += `&version=${enc(version)}`;
  return { path };
}

export function CodeSystem_validate_code_POST({ system, code, display, version }) {
  const params = [
    { name: 'system', valueUri:  system },
    { name: 'code',   valueCode: code },
  ];
  if (display) params.push({ name: 'display', valueString: display });
  if (version) params.push({ name: 'version', valueString: version });
  return post('/CodeSystem/$validate-code', params);
}

// ─── CodeSystem/$subsumes ──────────────────────────────────────────────────

export function CodeSystem_subsumes_GET({ system, codeA, codeB }) {
  return { path: `/CodeSystem/$subsumes?system=${enc(system)}&codeA=${enc(codeA)}&codeB=${enc(codeB)}` };
}

export function CodeSystem_subsumes_POST({ system, codeA, codeB }) {
  return post('/CodeSystem/$subsumes', [
    { name: 'system', valueUri:  system },
    { name: 'codeA',  valueCode: codeA },
    { name: 'codeB',  valueCode: codeB },
  ]);
}

// ─── ValueSet/$validate-code ───────────────────────────────────────────────

export function ValueSet_validate_code_GET({ url, system, code, display }) {
  let path = `/ValueSet/$validate-code?url=${enc(url)}&system=${enc(system)}&code=${enc(code)}`;
  if (display) path += `&display=${enc(display)}`;
  return { path };
}

export function ValueSet_validate_code_POST({ url, valueSet, system, code, display }) {
  const params = [];
  if (url)      params.push({ name: 'url',      valueUri:  url });
  if (valueSet) params.push({ name: 'valueSet', resource:  valueSet });
  params.push(
    { name: 'system', valueUri:  system },
    { name: 'code',   valueCode: code },
  );
  if (display) params.push({ name: 'display', valueString: display });
  return post('/ValueSet/$validate-code', params);
}

// ─── ValueSet/$expand ──────────────────────────────────────────────────────

export function ValueSet_expand_GET({ url, filter, count, offset, includeDesignations }) {
  let path = `/ValueSet/$expand?url=${enc(url)}`;
  if (filter !== undefined)              path += `&filter=${enc(filter)}`;
  if (count !== undefined)               path += `&count=${count}`;
  if (offset !== undefined)              path += `&offset=${offset}`;
  if (includeDesignations !== undefined) path += `&includeDesignations=${includeDesignations}`;
  return { path };
}

export function ValueSet_expand_POST({ url, valueSet, filter, count, offset, includeDesignations }) {
  const params = [];
  if (url)                               params.push({ name: 'url',                valueUri:     url });
  if (valueSet)                          params.push({ name: 'valueSet',            resource:     valueSet });
  if (filter !== undefined)              params.push({ name: 'filter',              valueString:  filter });
  if (count !== undefined)               params.push({ name: 'count',               valueInteger: count });
  if (offset !== undefined)              params.push({ name: 'offset',              valueInteger: offset });
  if (includeDesignations !== undefined) params.push({ name: 'includeDesignations', valueBoolean: includeDesignations });
  return post('/ValueSet/$expand', params);
}

// ─── ConceptMap/$translate ─────────────────────────────────────────────────

export function ConceptMap_translate_GET({ url, system, code, targetSystem }) {
  return { path: `/ConceptMap/$translate?url=${enc(url)}&system=${enc(system)}&code=${enc(code)}&target=${enc(targetSystem)}` };
}

export function ConceptMap_translate_POST({ url, system, code, targetSystem }) {
  return post('/ConceptMap/$translate', [
    { name: 'url',    valueUri:  url },
    { name: 'system', valueUri:  system },
    { name: 'code',   valueCode: code },
    { name: 'target', valueUri:  targetSystem },
  ]);
}

// ─── FHIR Search ───────────────────────────────────────────────────────────

export function search(resourceType, params) {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${enc(String(v))}`)
    .join('&');
  return { path: `/${resourceType}?${qs}` };
}

// ─── Internals ─────────────────────────────────────────────────────────────

function post(path, parameters) {
  return {
    path,
    method:  'POST',
    body:    JSON.stringify({ resourceType: 'Parameters', parameter: parameters }),
    headers: { 'Content-Type': 'application/fhir+json' },
  };
}

function enc(s) {
  return encodeURIComponent(s);
}
