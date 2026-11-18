// Gather candidate projections for changed pins from a participant's reference deployment.
import { answer } from '../../k6/IG/answers.js';
import { wire } from '../../k6/IG/transport.js';
import { digest } from './transcript';
const [file, out] = Bun.argv.slice(2);
if (!file || !out || !process.env.SOURCE_LABEL)
  throw new Error(
    'Usage: SOURCE_LABEL=... REF_4_0=... bun scripts/publisher/reference.ts WORKLOAD.json NEW-CANDIDATES.json'
  );
if (await Bun.file(out).exists()) throw new Error('Choose a new candidate file');
const w = await Bun.file(file).json(),
  pending = new Set<number>();
for (const t of w.traces) for (const [, id, , , kind] of t.events) if (kind === 'unreviewed') pending.add(id);
const results: Record<string, any> = {};
for (const id of pending) {
  const s = w.requests[id],
    base = process.env['REF_' + s.release.replace('.', '_')];
  if (!base) throw new Error('Missing reference base for release ' + s.release);
  const req = wire(s, (id: string) => w.assets[id], null);
  const media = 'application/fhir+json; fhirVersion=' + s.release;
  try {
    const res = await fetch(base.replace(/\/$/, '') + '/' + req.path, {
      method: req.method,
      headers: { accept: media, 'content-type': media },
      redirect: 'error',
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    const projected = answer(s.route.split('/')[1] || 'search', await res.json());
    if (res.ok && projected && projected[0] !== 'issue')
      results[s.fingerprint] = {
        status: res.status,
        kind: projected[0],
        digest: digest(projected),
        source: process.env.SOURCE_LABEL,
        projection: projected,
      };
  } catch (e) {
    console.warn(s.fingerprint, String(e));
  }
}
await Bun.write(out, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({ candidates: Object.keys(results).length, queried: pending.size }));
