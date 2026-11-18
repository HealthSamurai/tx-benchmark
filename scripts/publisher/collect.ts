// Fetch one observed build per package from the public IG Publisher QA index.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import { select } from './selection';
import type { Report } from './selection';

const [endDay, directory] = Bun.argv.slice(2);
if (!directory || !/^\d{4}-\d{2}-\d{2}$/.test(endDay))
  throw new Error('Usage: bun scripts/publisher/collect.ts YYYY-MM-DD <private-capture-directory>');
const indexUrl = 'https://build.fhir.org/ig/qas.json';
await mkdir(directory, { recursive: true });
const indexFile = join(directory, 'qas.json');
if (!(await Bun.file(indexFile).exists())) {
  const res = await fetch(indexUrl);
  if (!res.ok) throw new Error('QA index HTTP ' + res.status);
  await writeFile(indexFile, new Uint8Array(await res.arrayBuffer()));
}
const raw = await readFile(indexFile);
const reports: Report[] = JSON.parse(raw.toString());
const { start, end, candidates, rows } = select(reports, endDay);
async function collect(r: Report) {
  const id = r['package-id'];
  const report = new URL(r.repo, 'https://build.fhir.org/ig/');
  if (
    report.origin !== 'https://build.fhir.org' ||
    !report.pathname.startsWith('/ig/') ||
    !report.pathname.endsWith('/qa.json')
  )
    throw new Error('Unexpected QA report URL');
  const url = new URL('qa-tx.html', report).href;
  const key = createHash('sha256')
    .update(JSON.stringify([id, url, r.dateISO8601]))
    .digest('hex')
    .slice(0, 24);
  const entry = { package: id, report: report.href, date: r.dateISO8601, fhir: r.version, url, key };
  const receipt = join(directory, key + '.json');
  if (await Bun.file(receipt).exists()) return JSON.parse(await readFile(receipt, 'utf8'));
  const part = join(directory, key + '.gz.part');
  async function sameBuild() {
    const res = await fetch(report, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error('QA report HTTP ' + res.status);
    const qa = await res.json();
    return qa['package-id'] === id && Date.parse(qa.dateISO8601) === Date.parse(r.dateISO8601);
  }
  try {
    if (!(await sameBuild())) throw new Error('build changed since index snapshot');
    const res = await fetch(url, { signal: AbortSignal.timeout(240_000) });
    if (!res.ok || !res.body) throw new Error('transcript HTTP ' + res.status);
    const hash = createHash('sha256');
    let bytes = 0;
    const observe = new Transform({
      transform(chunk, _, done) {
        hash.update(chunk);
        bytes += chunk.length;
        done(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(res.body as any),
      observe,
      createGzip({ level: 1 }),
      createWriteStream(part)
    );
    if (!(await sameBuild())) throw new Error('build changed while reading transcript');
    const result = { ...entry, sha256: hash.digest('hex'), bytes };
    await rename(part, join(directory, key + '.gz'));
    await writeFile(receipt, JSON.stringify(result));
    return result;
  } catch (e) {
    await rm(part, { force: true });
    return { ...entry, error: e instanceof Error ? e.message : String(e) };
  }
}
const builds = new Array(rows.length);
let next = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (next < rows.length) {
      const i = next++;
      builds[i] = await collect(rows[i]);
      console.log(i + 1, '/', rows.length, builds[i].package, builds[i].error ?? builds[i].bytes);
    }
  })
);
await Bun.write(
  join(directory, 'manifest.json'),
  JSON.stringify(
    {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      indexUrl,
      indexSha256: createHash('sha256').update(raw).digest('hex'),
      indexEntries: reports.length,
      windowEntries: candidates.length,
      builds,
    },
    null,
    2
  ) + '\n'
);
