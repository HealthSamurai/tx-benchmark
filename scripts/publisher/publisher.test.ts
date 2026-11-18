import { expect, test } from 'bun:test';
import { gzipSync } from 'node:zlib';
import { answer } from '../../k6/IG/answers.js';
import { wire } from '../../k6/IG/transport.js';
import { select } from './selection';
import { context, references, resourceIsPortable, systems, remember } from './model';
import { coreProfile } from './profile';
import { sha, entries } from './transcript';

test('seven UTC days, latest per package, stable branch tie', () => {
  const row = (repo: string, dateISO8601: string) => ({
    'package-id': 'ig',
    repo,
    dateISO8601,
    version: '4.0.1',
  });
  const r = select(
    [
      row('future', '2026-11-18T00:00:00Z'),
      row('a', '2026-11-11T03:00:00+03:00'),
      row('y', '2026-11-17T00:00:00Z'),
      row('b', '2026-11-17T00:00:00Z'),
    ],
    '2026-11-18'
  );
  expect(r.candidates).toHaveLength(3);
  expect(r.rows.map((x) => x.repo)).toEqual(['b']);
  expect(() => select([], '2026-02-30')).toThrow();
});
test('literal requests, escaped responses, checksum rejection', () => {
  const text =
    '<hr/><a name="l4"> </a>\n<pre>\nPOST http://source/a HTTP/1.1\n\n{"value":"a&amp;b"}\n</pre>\n<pre>\n200\n\n{&quot;value&quot;:&quot;a&amp;b&quot;}\n</pre>';
  const [x] = entries(gzipSync(text), sha(text));
  expect(x.seq).toBe(4);
  expect(x.req.body.value).toBe('a&amp;b');
  expect(x.res.body.value).toBe('a&b');
  expect(() => [...entries(gzipSync(text), 'wrong')]).toThrow();
});
test('resolve indirect and versioned dependencies without leaking between lanes', () => {
  const map = new Map<string, string>(),
    assets = new Map([
      ['a', { refs: ['urn:b|1'] }],
      ['b', { refs: [] }],
      ['c', { refs: [] }],
    ]);
  remember(map, { url: 'urn:a' }, 'a');
  remember(map, { url: 'urn:b', version: '1' }, 'b');
  remember(map, { url: 'urn:b', version: '2' }, 'c');
  expect(context(map, ['urn:a'], [], assets)).toEqual(['a', 'b']);
  expect(context(new Map(), ['urn:a'], [], assets)).toEqual([]);
  expect(references({ compose: { include: [{ valueSet: ['urn:a'] }] } }, new URLSearchParams())).toContain(
    'urn:a'
  );
  expect(resourceIsPortable({ resourceType: 'CodeSystem', concept: [{ code: 'a' }] })).toBe(false);
});
test('stateless GET creates typed Parameters, session consumes previously supplied context', () => {
  const spec = {
    method: 'GET',
    route: 'ValueSet/$validate-code',
    query: [
      ['url', 'urn:vs'],
      ['inferSystem', 'true'],
    ],
    context: ['a'],
    body: null,
  };
  const r = { resourceType: 'ValueSet', url: 'urn:vs' };
  expect(wire(spec, () => r, null).body.parameter).toEqual([
    { name: 'url', valueUri: 'urn:vs' },
    { name: 'inferSystem', valueBoolean: true },
    { name: 'tx-resource', resource: r },
  ]);
  expect(wire(spec, () => r, new Set(['a'])).method).toBe('GET');
});
test('validation result type, expansion counts/members, batch order', () => {
  const val = (b: any) => ({ resourceType: 'Parameters', parameter: [{ name: 'result', valueBoolean: b }] });
  expect(answer('$validate-code', val('false'))).toBeNull();
  expect(answer('$validate-code', val(false))).not.toEqual(answer('$validate-code', val(true)));
  const ex = (total: number, code: string) => ({
    resourceType: 'ValueSet',
    expansion: { total, contains: [{ system: 'urn:s', code }] },
  });
  expect(answer('$expand', ex(2, 'x'))).not.toEqual(answer('$expand', ex(1, 'x')));
  expect(answer('$expand', ex(2, 'x'))).not.toEqual(answer('$expand', ex(2, 'y')));
  const batch = (bs: boolean[]) => ({
    resourceType: 'Parameters',
    parameter: bs.map((b) => ({ name: 'validation', resource: val(b) })),
  });
  expect(answer('$batch-validate-code', batch([true, false]))).not.toEqual(
    answer('$batch-validate-code', batch([false, true]))
  );
});
test('pin within an edition, retain original, reject national and opaque constraints', () => {
  const spec = (edition: string) => ({
    groups: ['snomed'],
    systems: [systems.snomed],
    query: [],
    context: [],
    route: 'CodeSystem/$validate-code',
    method: 'POST',
    body: {
      resourceType: 'Parameters',
      parameter: [
        { name: 'coding', valueCoding: { system: systems.snomed, code: 'a' } },
        { name: 'system-version', valueCanonical: systems.snomed + '|' + systems.snomed + '/' + edition },
      ],
    },
  });
  const us = spec('731000124108'),
    out = coreProfile(us);
  expect(out.changed).toBe(true);
  expect(out.spec.body.parameter[0].valueCoding.version).toEndWith('/731000124108/version/20260301');
  expect(us.body.parameter[0].valueCoding).not.toHaveProperty('version');
  expect(() => coreProfile(spec('32506021000036107'))).toThrow();
  expect(() => coreProfile({ ...us, context: ['abc'] })).toThrow();
});

test('single edition mode excludes a US code without translating it to International', () => {
  const us = {
    groups: ['snomed'],
    systems: [systems.snomed],
    route: 'CodeSystem/$lookup',
    method: 'POST',
    query: [],
    context: [],
    body: {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'coding',
          valueCoding: { system: systems.snomed, version: systems.snomed + '/731000124108', code: 'a' },
        },
      ],
    },
  };
  expect(() => coreProfile(us, true)).toThrow('outside International edition');
});
test('a negative with the wrong reason and a malformed response cannot pass', () => {
  const negative = (code: string) => ({
    resourceType: 'Parameters',
    parameter: [
      { name: 'result', valueBoolean: false },
      {
        name: 'issues',
        resource: { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code }] },
      },
    ],
  });
  expect(answer('$validate-code', negative('not-found'))).not.toEqual(
    answer('$validate-code', negative('not-supported'))
  );
  expect(answer('$validate-code', { resourceType: 'Parameters', parameter: 'no' })).toBeNull();
});
