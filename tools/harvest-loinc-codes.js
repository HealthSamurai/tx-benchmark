#!/usr/bin/env node
/**
 * harvest-loinc-codes.js
 *
 * Samples LOINC observable codes (excludes LP part codes) by fetching
 * pages at random offsets via ValueSet/$expand on an ad-hoc ValueSet.
 *
 * Usage:
 *   node tools/harvest-loinc-codes.js [base-url] [target-count]
 *
 * Examples:
 *   node tools/harvest-loinc-codes.js http://localhost:7001/fhir 2000
 *   node tools/harvest-loinc-codes.js http://localhost:7001/fhir 200 --dry-run
 *
 * Outputs: k6/pools/loinc/codes.json
 */

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL  = process.argv[2] || 'http://localhost:7001/fhir';
const TARGET    = parseInt(process.argv[3] || '2000', 10);
const DRY_RUN   = process.argv.includes('--dry-run');
const OUT_PATH  = path.resolve(__dirname, '../k6/pools/loinc/codes.json');

const PAGE_SIZE  = 100;  // codes per request
const TOTAL      = 183412;
const PROBE_STEPS = 20;  // pages to sample when finding productive range

// ── HTTP ──────────────────────────────────────────────────────────────────────

function post(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const lib = url.startsWith('https') ? https : http;
    const parsed = new URL(url);
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function fetchPage(offset) {
  const body = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'count',  valueInteger: PAGE_SIZE },
      { name: 'offset', valueInteger: offset },
      { name: 'valueSet', resource: {
        resourceType: 'ValueSet',
        compose: { include: [{ system: 'http://loinc.org' }] },
      }},
    ],
  };
  const res = await post(`${BASE_URL}/ValueSet/$expand`, body);
  return (res.expansion?.contains ?? []).map((c) => c.code).filter(Boolean);
}

// ── Probe to find max productive offset ───────────────────────────────────────

/**
 * Sample PROBE_STEPS evenly-spaced pages across the full range and measure
 * LP density. Returns the highest offset where non-LP yield is still > 10%.
 */
async function findMaxOffset() {
  process.stdout.write('Probing LP density across offset range...\n');
  let maxOffset = PAGE_SIZE; // fallback

  for (let i = PROBE_STEPS - 1; i >= 0; i--) {
    const offset = Math.floor((i / PROBE_STEPS) * (TOTAL - PAGE_SIZE) / PAGE_SIZE) * PAGE_SIZE;
    const codes = await fetchPage(offset);
    const nonLP = codes.filter((c) => !c.startsWith('LP')).length;
    const pct = codes.length > 0 ? Math.round((nonLP / codes.length) * 100) : 0;
    process.stdout.write(`  offset=${offset}: ${nonLP}/${codes.length} non-LP (${pct}%)\n`);
    if (pct > 10) {
      maxOffset = offset + PAGE_SIZE;
      break;
    }
  }

  process.stdout.write(`Max productive offset: ${maxOffset}\n\n`);
  return maxOffset;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Target   : ${TARGET} codes`);
  console.log(`Total    : ~${TOTAL} LOINC codes`);
  console.log(`Output   : ${DRY_RUN ? '(dry run, no write)' : OUT_PATH}`);
  console.log();

  const maxOffset = await findMaxOffset();
  const collected = new Set();

  // Build and shuffle all page-aligned offsets upfront to avoid collision spinning
  const offsets = [];
  for (let o = 0; o < maxOffset; o += PAGE_SIZE) offsets.push(o);
  for (let i = offsets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [offsets[i], offsets[j]] = [offsets[j], offsets[i]];
  }

  for (const offset of offsets) {
    if (collected.size >= TARGET) break;

    process.stdout.write(`  [${collected.size}/${TARGET}] offset=${offset}\r`);

    let codes;
    try {
      codes = await fetchPage(offset);
    } catch {
      continue;
    }

    for (const code of codes) {
      if (!code.startsWith('LP')) collected.add(code);
    }
  }

  process.stdout.write('\n');

  const result = Array.from(collected).slice(0, TARGET);
  console.log(`Total unique codes: ${result.length}`);

  if (DRY_RUN) {
    console.log('Dry run — sample:');
    console.log(result.slice(0, 20));
    return;
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
  console.log(`Written to ${OUT_PATH}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
