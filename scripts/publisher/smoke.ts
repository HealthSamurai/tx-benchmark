// Exercise the generator, preparation and both normal k6 modes against a local fixture.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { sha } from './transcript';

const dir = await mkdtemp(join(tmpdir(), 'tx-publisher-')),
  pool = join(dir, 'pool'),
  work = join(dir, 'work');
const resource = {
  resourceType: 'ValueSet',
  url: 'urn:fixture:vs',
  status: 'active',
  compose: { include: [{ system: 'urn:fixture:cs' }] },
};
const params = (parameter: any[]) => ({ resourceType: 'Parameters', parameter });
const validated = params([{ name: 'result', valueBoolean: true }]);
let wrong = false,
  starts = 0,
  ends = 0,
  seen = 0;
const sessions = new Map<string, boolean>();
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(req) {
    const u = new URL(req.url),
      id = req.headers.get('x-cache-id') || '';
    if (u.pathname === '/$cache-control' && u.searchParams.get('mode') === 'start') {
      const fresh = 'fixture-' + ++starts;
      sessions.set(fresh, false);
      return Response.json(params([{ name: 'cache-id', valueId: fresh }]));
    }
    if (u.pathname === '/$cache-control' && u.searchParams.get('mode') === 'end') {
      if (!sessions.delete(id)) return new Response(null, { status: 400 });
      ends++;
      return Response.json(params([]));
    }
    if (u.pathname !== '/ValueSet/$validate-code') return new Response(null, { status: 404 });
    const b = await req.json(),
      attached = b.parameter.some((p: any) => p.resource?.url === resource.url);
    if (id && attached) sessions.set(id, true);
    if (!(attached || sessions.get(id))) return new Response(null, { status: 422 });
    seen++;
    return Response.json(wrong ? params([{ name: 'result', valueBoolean: false }]) : validated);
  },
});
async function run(cmd: string[], env: any = {}, expectFailure = false) {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ...env } });
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (expectFailure ? code !== 99 : code !== 0)
    throw new Error(cmd.join(' ') + ' returned ' + code + '\n' + out + '\n' + err);
}
try {
  const entry = (n: number, body: any) =>
    '<hr/><a name="l' +
    n +
    '"> </a>\n<pre>\nPOST https://recorded.example/r4/ValueSet/$validate-code HTTP/1.1\nX-Cache-Id: old\n\n' +
    JSON.stringify(body) +
    '\n</pre>\n<pre>\n200\n\n' +
    JSON.stringify(validated) +
    '\n</pre>\n';
  const html =
    entry(1, params([{ name: 'valueSet', resource }])) +
    entry(2, params([{ name: 'url', valueUri: resource.url }]));
  await writeFile(join(dir, 'fixture.gz'), gzipSync(html));
  await Bun.write(
    join(dir, 'manifest.json'),
    JSON.stringify({ builds: ['a', 'b'].map((x) => ({ package: x, key: 'fixture', sha256: sha(html) })) })
  );
  await run(['bun', 'scripts/publisher/generate.ts', dir, pool]);
  await run(['bun', 'scripts/publisher/prepare.ts', pool, work]);
  const command = [process.env.K6 || 'k6', 'run', '--quiet', 'k6/IG/publisher.js'];
  const env = {
    VUS: '2',
    REPEATS: '2',
    BASE_URL: 'http://127.0.0.1:' + server.port,
    WORKLOAD: join(work, 'workload.json'),
  };
  await run(command, { ...env, MODE: 'stateless' });
  if (starts !== 0 || seen !== 8) throw new Error('Stateless count mismatch');
  await run(command, { ...env, MODE: 'session' });
  if (Number(starts) !== 4 || ends !== 4 || sessions.size || Number(seen) !== 16)
    throw new Error('Session lifecycle/count mismatch');
  wrong = true;
  await run(command, { ...env, MODE: 'stateless' }, true);
  console.log(
    'Both modes passed with two VUs and two passes. Deliberate wrong answers failed the reference threshold.'
  );
} finally {
  server.stop(true);
  await rm(dir, { recursive: true, force: true });
}
