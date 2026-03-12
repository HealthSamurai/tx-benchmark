#!/usr/bin/env node
/**
 * harvest-loinc-codes-pg.js  (temporary — delete once offset is fixed in Termbox)
 *
 * Fetches a random sample of numeric LOINC codes directly from the Termbox
 * PostgreSQL database, bypassing the broken ValueSet/$expand offset parameter.
 *
 * Usage:
 *   node tools/harvest-loinc-codes-pg.js [pg-url] [target-count]
 *
 * Example:
 *   node tools/harvest-loinc-codes-pg.js postgres://postgres@localhost:54321/termbox 2000
 *
 * Outputs: k6/pools/loinc/codes.json
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PG_URL  = process.argv[2] || 'postgres://postgres@localhost:54321/termbox';
const TARGET  = parseInt(process.argv[3] || '2000', 10);
const OUT_PATH = path.resolve(__dirname, '../k6/pools/loinc/codes.json');

const sql = `
  SELECT code FROM concept
  WHERE codesystem_id = (SELECT id FROM codesystem WHERE url = 'http://loinc.org')
    AND active = true
    AND code ~ '^[0-9]'
  ORDER BY random()
  LIMIT ${TARGET};
`;

console.log(`Querying ${PG_URL} for ${TARGET} random LOINC codes...`);

const output = execSync(`psql "${PG_URL}" -t -A -c "${sql.replace(/\n/g, ' ')}"`).toString();
const codes = output.trim().split('\n').filter(Boolean);

console.log(`Got ${codes.length} codes. Sample: ${codes.slice(0, 5).join(', ')}`);

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(codes, null, 2));
console.log(`Written to ${OUT_PATH}`);
