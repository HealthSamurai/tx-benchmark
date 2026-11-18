// Recover optional asset bodies from licensed local files or the exact frozen transcripts.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { digest, entries, sha, readPool } from './transcript';
import { visit } from './model';

const [pool, out, ...local] = Bun.argv.slice(2);
if (!pool || !out)
  throw new Error('Usage: bun scripts/publisher/hydrate.ts POOL PRIVATE-OUTPUT.json.gz [RESOURCE.json ...]');
const m = await Bun.file(join(pool, 'manifest.json')).json();
const external = await readPool(pool, m.hashes, 'external');
const wanted = new Set<string>(external.map((x: any) => x.id));
const found: Record<string, any> = {};
if (await Bun.file(out).exists()) {
  for (const [id, r] of Object.entries(JSON.parse(gunzipSync(await readFile(out)).toString())))
    if (wanted.has(id) && digest(r) === id) found[id] = r;
}
function take(r: any) {
  if (!['ValueSet', 'CodeSystem', 'ConceptMap'].includes(r.resourceType)) return;
  const id = digest(r);
  if (wanted.has(id)) found[id] = r;
}
for (const resource of local) visit(await Bun.file(resource).json(), take);
if (process.env.CAPTURE || process.env.FETCH === '1') {
  for (const source of m.sources) {
    if (source.error) continue;
    const needed = external.filter((x: any) => x.source[0] === source.package && !found[x.id]);
    if (!needed.length) continue;
    const key = sha(JSON.stringify([source.package, source.url, source.date])).slice(0, 24);
    const file = process.env.CAPTURE && join(process.env.CAPTURE, key + '.gz');
    let bytes;
    if (file && (await Bun.file(file).exists())) bytes = await readFile(file);
    else if (process.env.FETCH === '1') {
      try {
        const url = new URL(source.url);
        if (url.origin !== 'https://build.fhir.org' || !url.pathname.endsWith('/qa-tx.html'))
          throw new Error('Unexpected source URL');
        const res = await fetch(url, { signal: AbortSignal.timeout(240_000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const raw = Buffer.from(await res.arrayBuffer());
        if (sha(raw) !== source.sha256) throw new Error('source changed');
        bytes = gzipSync(raw, { level: 1 });
        if (file) {
          await mkdir(process.env.CAPTURE!, { recursive: true });
          await writeFile(file, bytes);
        }
      } catch (e) {
        console.warn(source.package, String(e));
        continue;
      }
    }
    if (bytes) for (const { req } of entries(bytes, source.sha256)) visit(req.body, take);
  }
}
const temp = out + '.' + process.pid + '.tmp';
await writeFile(temp, gzipSync(Buffer.from(JSON.stringify(found)), { level: 9 }));
await rename(temp, out);
console.log(
  JSON.stringify({
    recovered: Object.keys(found).length,
    requested: wanted.size,
    missing: wanted.size - Object.keys(found).length,
  })
);
