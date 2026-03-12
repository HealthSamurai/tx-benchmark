#!/usr/bin/env node
/**
 * harvest-fhir-pkg-codes.js
 *
 * Samples codes from small/medium FHIR package codesystems directly from
 * the Termbox PostgreSQL database. Outputs an array of [url, code] tuples.
 *
 * Usage:
 *   node tools/harvest-fhir-pkg-codes.js [pg-url] [codes-per-system]
 *
 * Example:
 *   node tools/harvest-fhir-pkg-codes.js postgres://postgres@localhost:54321/termbox 20
 *
 * Outputs: k6/pools/fhir-pkg/tuples.json
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PG_URL          = process.argv[2] || 'postgres://postgres@localhost:54321/termbox';
const CODES_PER_SYSTEM = parseInt(process.argv[3] || '20', 10);
const OUT_PATH        = path.resolve(__dirname, '../k6/pools/fhir-pkg/tuples.json');

// Selected codesystems: representative spread across loaded FHIR packages
// Packages: FHIR R4 Core, HL7 THO, US Core IG, us.nlm.vsac
const SYSTEMS = [
  // FHIR R4 Core
  'http://dicom.nema.org/resources/ontology/DCM',          // DICOM (3156 codes)
  'http://hl7.org/fhir/resource-types',                    // FHIR resource types (148)
  'http://hl7.org/fhir/issue-type',                        // OperationOutcome issue types (31)
  'http://hl7.org/fhir/questionnaire-item-control',        // Questionnaire item controls (25)
  'http://hl7.org/fhir/item-type',                         // Questionnaire item types (17)

  // HL7 THO
  'http://terminology.hl7.org/CodeSystem/v3-ActCode',      // v3 ActCode (2418)
  'http://terminology.hl7.org/CodeSystem/v3-RoleCode',     // v3 RoleCode (810)
  'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration', // Routes (777)
  'http://terminology.hl7.org/CodeSystem/v3-ActReason',   // v3 ActReason (578)
  'http://terminology.hl7.org/CodeSystem/service-type',   // Service types (1192)
  'http://terminology.hl7.org/CodeSystem/v3-SpecimenType', // Specimen types (250)
  'http://terminology.hl7.org/CodeSystem/v2-0203',         // Identifier types (274)

  // US Core IG
  'http://hl7.org/fhir/us/core/CodeSystem/us-core-category',  // US Core category (8)
  'http://hl7.org/fhir/us/core/CodeSystem/condition-category', // Condition category (2)

  // External codesystems bundled via VSAC package
  'https://www.cdc.gov/nhsn/cdaportal/terminology/codesystem/cdcnhsn.html', // CDC NHSN (658)
  'https://nahdo.org/sopt',                                // SOPT (167)
];

const systemList = SYSTEMS.map((s) => `('${s}')`).join(',\n    ');

const sql = `
  WITH selected_systems AS (
    SELECT url FROM (VALUES ${systemList}) AS t(url)
  ),
  ranked_cs AS (
    SELECT cs.id AS codesystem_id, cs.url, cs.version,
           count(c.id) AS cnt,
           row_number() OVER (PARTITION BY cs.url ORDER BY count(c.id) DESC) AS rn
    FROM codesystem cs
    JOIN concept c ON c.codesystem_id = cs.id
      AND c.partition_id = 'default' AND c.active = true
    WHERE cs.url IN (SELECT url FROM selected_systems)
    GROUP BY cs.id, cs.url, cs.version
  ),
  best_version AS (
    SELECT codesystem_id, url, version FROM ranked_cs WHERE rn = 1
  ),
  sampled AS (
    SELECT bv.url, bv.version, c.code,
           row_number() OVER (PARTITION BY bv.url ORDER BY random()) AS rn
    FROM best_version bv
    JOIN concept c ON c.codesystem_id = bv.codesystem_id
      AND c.partition_id = 'default' AND c.active = true
  )
  SELECT url || '|' || code || '|' || version FROM sampled WHERE rn <= ${CODES_PER_SYSTEM}
  ORDER BY url, rn
`.replace(/\n/g, ' ');

console.log(`Querying ${PG_URL}`);
console.log(`Systems : ${SYSTEMS.length}, up to ${CODES_PER_SYSTEM} codes each\n`);

const output = execSync(`psql "${PG_URL}" -t -A -c "${sql}"`).toString();
const lines  = output.trim().split('\n').filter(Boolean);
const tuples = lines.map((line) => {
  // format: url|code|version
  const parts = line.split('|');
  const version = parts.pop();
  const code    = parts.pop();
  const url     = parts.join('|'); // url may contain | in urn:oid form, rejoin
  return [url, code, version];
});

// Print summary per system
const bySystem = {};
for (const [url, code, version] of tuples) {
  bySystem[url] = { count: (bySystem[url]?.count || 0) + 1, version };
}
for (const [url, { count, version }] of Object.entries(bySystem)) {
  console.log(`  ${count.toString().padStart(3)} codes  ${url}  (${version})`);
}
console.log(`\nTotal tuples: ${tuples.length}`);

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(tuples, null, 2));
console.log(`Written to ${OUT_PATH}`);
