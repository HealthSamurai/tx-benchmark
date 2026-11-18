import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { stable } from '../../k6/IG/answers.js';

export const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const digest = (value: unknown) => sha(JSON.stringify(stable(value)));
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
function decode(s: string) {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (orig, k) => {
    if (entities[k]) return entities[k];
    const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : Number(k.slice(1));
    return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : orig;
  });
}
function message(s = '') {
  const split = s.indexOf('\n\n');
  const lines = (split < 0 ? s : s.slice(0, split)).trim().split('\n');
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const pos = line.indexOf(':');
    if (pos > 0) headers[line.slice(0, pos).toLowerCase()] = decode(line.slice(pos + 1).trim());
  }
  const raw = split < 0 ? '' : s.slice(split + 2).trim();
  let body = null,
    invalid = false;
  if (raw) {
    // Publisher writes request JSON literally and HTML-escapes response JSON.
    try {
      body = JSON.parse(raw);
    } catch {
      try {
        body = JSON.parse(decode(raw));
      } catch {
        invalid = true;
      }
    }
  }
  return { first: decode(lines[0]), headers, body, invalid };
}
export function* entries(gzip: Buffer, expectedHash: string) {
  const bytes = gunzipSync(gzip);
  if (sha(bytes) !== expectedHash) throw new Error('Transcript SHA-256 mismatch');
  const html = bytes.toString('utf8').replace(/\r\n/g, '\n');
  const anchors = [...html.matchAll(/^<hr\/><a name="l(\d+)"> <\/a>/gm)];
  if (!anchors.length && !/<html|terminology/i.test(html)) throw new Error('Unrecognized transcript');
  for (let i = 0; i < anchors.length; i++) {
    const chunk = html.slice(anchors[i].index, anchors[i + 1]?.index);
    const blocks = [...chunk.matchAll(/<pre>\n?([\s\S]*?)<\/pre>/g)];
    yield { seq: Number(anchors[i][1]), req: message(blocks[0]?.[1]), res: message(blocks[1]?.[1]) };
  }
}

export async function readPool(directory: string, hashes: Record<string, string>, name: string) {
  const bytes = await readFile(join(directory, name + '.json.gz'));
  if (sha(bytes) !== hashes[name]) throw new Error('Pool checksum mismatch: ' + name);
  return JSON.parse(gunzipSync(bytes).toString());
}
