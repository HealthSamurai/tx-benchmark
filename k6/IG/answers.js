// This module is shared by the Bun generator and the k6 replay.
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, stable(value[k])])
    );
  return value;
}

function sorted(values) {
  return values.map((v) => JSON.stringify(stable(v))).sort();
}

export function answer(operation, body) {
  try {
    return project(operation, body);
  } catch {
    // A malformed FHIR answer is a failed check, including during a load run.
    return null;
  }
}
function project(operation, body) {
  if (!body || typeof body !== 'object') return null;
  const params = body.parameter || [];
  const values = (name) => params.filter((p) => p.name === name);
  const fields = (names) => sorted(params.filter((p) => names.includes(p.name)));
  const issues = (list) =>
    sorted(
      (list || []).map((i) => [
        i.severity,
        i.code,
        sorted((i.details?.coding || []).map((c) => [c.system, c.code])),
      ])
    );
  if (body.resourceType === 'OperationOutcome') {
    if (!body.issue?.length) return null;
    return ['issue', issues(body.issue)];
  }
  if (operation === '$expand' && body.resourceType === 'ValueSet' && body.expansion) {
    function members(nodes) {
      return sorted(
        (nodes || []).map((n) => [
          n.system,
          n.version,
          n.code,
          n.display,
          n.inactive ?? false,
          n.abstract ?? false,
          sorted(n.designation || []),
          members(n.contains),
        ])
      );
    }
    const e = body.expansion;
    return ['expansion', e.total ?? null, e.offset ?? 0, members(e.contains)];
  }
  if (operation === 'search' && body.resourceType === 'Bundle' && body.type === 'searchset')
    return [
      'search',
      body.total ?? null,
      sorted((body.entry || []).map((e) => [e.resource?.resourceType, e.resource?.url, e.resource?.version])),
    ];
  if (body.resourceType !== 'Parameters') return null;
  if (
    operation === '$validate-code' &&
    values('result').length === 1 &&
    typeof values('result')[0].valueBoolean === 'boolean'
  )
    return [
      'validation',
      values('result')[0].valueBoolean,
      fields(['system', 'code', 'display', 'inactive']),
      values('result')[0].valueBoolean
        ? []
        : issues(values('issues').flatMap((p) => p.resource?.issue || [])),
    ];
  if (operation === '$lookup' && (values('display').length || values('name').length))
    return [
      'lookup',
      fields([
        'system',
        'code',
        'display',
        'version',
        'name',
        'abstract',
        'inactive',
        'property',
        'designation',
      ]),
    ];
  if (
    operation === '$subsumes' &&
    ['equivalent', 'subsumes', 'subsumed-by', 'not-subsumed'].includes(values('outcome')[0]?.valueCode)
  )
    return ['subsumption', values('outcome')[0].valueCode];
  if (operation === '$batch-validate-code') {
    const rows = values('validation').map((p) => answer('$validate-code', p.resource));
    if (rows.length && rows.every((row) => row && row[0] === 'validation')) return ['batch', rows];
  }
  return null;
}

// UCUM 2.2, sections 4.1–4.3. These code-only probes have an independent
// membership assertion even when a server chooses different display text.
export function ucumProbe(spec) {
  if (spec.route !== 'CodeSystem/$validate-code' || spec.query.length) return false;
  const ps = spec.body?.parameter || [];
  if (
    ps.some(
      (p) =>
        ![
          'coding',
          'displayLanguage',
          'defaultDisplayLanguage',
          'default-to-latest-version',
          'diagnostics',
          'lenient-display-validation',
          'system-version',
        ].includes(p.name)
    )
  )
    return false;
  const inputs = ps.filter((p) => p.name === 'coding');
  const c = inputs[0]?.valueCoding;
  return (
    inputs.length === 1 &&
    c?.system === 'http://unitsofmeasure.org' &&
    !c.version &&
    !c.display &&
    ['g', 'mg', 'mL', 'd', 'h'].includes(c.code) &&
    !ps.some((p) => p.name === 'system-version' && JSON.stringify(p).includes('unitsofmeasure.org'))
  );
}
