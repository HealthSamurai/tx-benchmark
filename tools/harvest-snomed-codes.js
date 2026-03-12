#!/usr/bin/env node
/**
 * harvest-snomed-codes.js
 *
 * Walks the SNOMED CT hierarchy via CodeSystem/$lookup (parent/child properties)
 * and collects a diverse sample of codes across branches and depth levels.
 *
 * Usage:
 *   node tools/harvest-snomed-codes.js [base-url] [target-count]
 *
 * Examples:
 *   node tools/harvest-snomed-codes.js http://localhost:7001/fhir 2000
 *   node tools/harvest-snomed-codes.js http://localhost:7001/fhir 500 --dry-run
 *
 * Outputs: k6/pools/snomed/codes.json
 */

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL   = process.argv[2] || 'http://localhost:7001/fhir';
const TARGET     = parseInt(process.argv[3] || '2000', 10);
const DRY_RUN    = process.argv.includes('--dry-run');
const OUT_PATH   = path.resolve(__dirname, '../k6/pools/snomed/codes.json');

const SYSTEM = 'http://snomed.info/sct';

// Top-level SNOMED hierarchy roots to seed BFS from.
// Each gets an equal share of the target count.
const BRANCH_ROOTS = [
  { code: '404684003', name: 'Clinical finding' },
  { code: '71388002',  name: 'Procedure' },
  { code: '123037004', name: 'Body structure' },
  { code: '410607006', name: 'Organism' },
  { code: '105590001', name: 'Substance' },
  { code: '373873005', name: 'Pharmaceutical / biologic product' },
  { code: '272379006', name: 'Event' },
  { code: '48176007',  name: 'Social context' },
];

// ── HTTP ──────────────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { Accept: 'application/fhir+json' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function lookup(code) {
  const url = `${BASE_URL}/CodeSystem/$lookup?system=${encodeURIComponent(SYSTEM)}&code=${code}`;
  const body = await get(url);

  if (!body.parameter) return null;

  const props = body.parameter.filter((p) => p.name === 'property');
  const children = props
    .filter((p) => p.part?.[0]?.valueCode === 'child')
    .map((p) => p.part[1]?.valueCode)
    .filter(Boolean);
  const parents = props
    .filter((p) => p.part?.[0]?.valueCode === 'parent')
    .map((p) => p.part[1]?.valueCode)
    .filter(Boolean);
  const display = body.parameter.find((p) => p.name === 'display')?.valueString;
  const inactive = props
    .find((p) => p.part?.[0]?.valueCode === 'inactive')
    ?.part[1]?.valueBoolean;

  return { code, display, children, parents, inactive: !!inactive };
}

// ── BFS ───────────────────────────────────────────────────────────────────────

/**
 * BFS from `root`, collecting up to `quota` codes.
 * Samples evenly across levels so we get shallow and deep codes.
 */
async function harvestBranch(root, quota) {
  const collected = [];   // { code, depth }
  const visited   = new Set([root]);
  const queue     = [{ code: root, depth: 0 }];

  // We want codes at every level, not just leaves.
  // Strategy: always enqueue children, but only record a node if it passes
  // a sampling gate that favours breadth (shallow nodes included more eagerly).

  while (queue.length > 0 && collected.length < quota) {
    const { code, depth } = queue.shift();

    process.stdout.write(`  [${collected.length}/${quota}] ${code} (depth ${depth})\r`);

    let info;
    try {
      info = await lookup(code);
    } catch {
      continue;
    }

    if (!info || info.inactive) continue;

    // Record every node we successfully look up (including non-leaf nodes)
    // so we sample across all levels of the hierarchy.
    if (code !== root) {  // skip the branch root itself (too abstract)
      collected.push(code);
    }

    // Shuffle children so we don't always walk the same subtree.
    const children = shuffle(info.children);
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push({ code: child, depth: depth + 1 });
      }
    }
  }

  process.stdout.write('\n');
  return collected;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Target   : ${TARGET} codes`);
  console.log(`Branches : ${BRANCH_ROOTS.length}`);
  console.log(`Output   : ${DRY_RUN ? '(dry run, no write)' : OUT_PATH}`);
  console.log();

  const quotaPerBranch = Math.ceil(TARGET / BRANCH_ROOTS.length);
  const allCodes = new Set();

  for (const branch of BRANCH_ROOTS) {
    console.log(`→ ${branch.name} (${branch.code}), quota=${quotaPerBranch}`);
    const codes = await harvestBranch(branch.code, quotaPerBranch);
    for (const c of codes) allCodes.add(c);
    console.log(`  collected ${codes.length}, total unique so far: ${allCodes.size}`);
  }

  const result = Array.from(allCodes);
  console.log(`\nTotal unique codes: ${result.length}`);

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
