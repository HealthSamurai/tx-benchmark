# IG Publisher weekly replay

This optional suite exercises the ordered terminology calls made by real FHIR implementation guide builds. The sampling unit is one build per package. Every retained call occurs as many times as it did in that build. A batch of 50 validations counts as one HTTP request. The Round 0 test IDs and compatibility grid keep their existing meanings.

## Run the frozen week

From the repository root, prepare the November 11–17, 2026 UTC corpus and point k6 at a server under test. This example selects R4 calls with UCUM as their only identified terminology family.

```sh
week=k6/pools/publisher/2026-11-11
RELEASES=4.0 GROUPS_ALLOWED=ucum bun scripts/publisher/prepare.ts "$week" results/IG
BASE_URL=http://localhost:8080/fhir MODE=stateless k6 run k6/IG/publisher.js
BASE_URL=http://localhost:8080/fhir MODE=session k6 run k6/IG/publisher.js
```

Omit the filters to prepare all available calls. For a mixed-release run, supply one base URL per selected FHIR wire release, for example `BASE_3_0`, `BASE_4_0` and `BASE_5_0`. An IG's declared FHIR version and the wire protocol used by its terminology client can differ. The runner maps the recorded services to the supplied endpoints and disables redirects. It sends calls sequentially within a build. `VUS` controls concurrent builds and `REPEATS` repeats the entire selected mix. The default is one pass with one worker. Set `MAX_DURATION` if the deployment needs more than eight hours. Use the same prepared file, VUs and repeats on each server.

- **Stateless** sends original inline resources and reattaches earlier definitions reached through canonical references in the same source session. A GET operation that needs attachments becomes a POST with typed Parameters.
- **Session** opens an unsealed cache with `POST $cache-control?mode=start`, uses the issued `X-Cache-Id` and closes it at build completion. Filtered traces reattach needed context on first use. Session state is isolated per build and source service/session. Original sessionless calls stay sessionless. Capability discovery, retry timing and raw session IDs are outside the replay. Calls with untrustworthy session history are counted in the exclusions.

The generator retains the other operation parameters, including language, paging, diagnostics, multi-coding inputs and inline resource bodies. It removes the opaque `x-system-cache-id` hint. The session workload measures the target's resource cache protocol. A server without that protocol can run the stateless workload.

## November 11–17, 2026 UTC

The index snapshot contained 2,321 branch entries. Of the 280 dated in this seven-day window, 104 distinct packages qualified. We recovered 100 transcripts. Three returned HTTP 404 and one branch had already changed. The transcripts contained 28,129 exchanges. The following counts retain repeated requests.

| Operation | Observed | Compiled with all assets | Bundled checkout |
| --- | ---: | ---: | ---: |
| CodeSystem/$validate-code | 12,757 | 11,363 | 11,343 |
| ValueSet/$validate-code | 7,321 | 5,672 | 1,394 |
| ValueSet/$expand | 3,769 | 2,371 | 615 |
| CodeSystem/$batch-validate-code | 595 | 432 | 432 |
| CodeSystem/$lookup | 642 | 345 | 345 |
| CodeSystem/$subsumes | 109 | 104 | 104 |
| ValueSet | 1,393 | 1,317 | 1,317 |
| CodeSystem | 211 | 211 | 211 |
| Discovery, cache control, instance reads and other routes | 1,332 | 0 | 0 |
| **All exchanges** | **28,129** | **21,815** | **15,761** |

The compiled pool has 16,372 distinct request specifications from 99 packages. It represents all source data calls in 43 builds once discovery and cache control are set aside. The checkout contributes calls from 92 packages and represents all source data calls in 0 complete builds. The largest compilation exclusion is 4,874 calls downstream of an unreadable session request. Hydration particularly changes the share of expansions and ValueSet validations. Compare servers within the same column. [Frozen manifest and source receipts](../../k6/pools/publisher/2026-11-11/manifest.json)

| Prepared profile | Eligible calls | Scorable using the recorded response | Changed inputs awaiting review |
| --- | ---: | ---: | ---: |
| Observed, bundled | 15,761 | 14,960 | 0 |
| Observed, hydrated | 21,815 | 20,729 | 0 |
| Core International + US, bundled | 9,611 | 6,388 | 3,152 |
| Core International only, bundled | 9,500 | 6,388 | 3,041 |

The observed profile includes 67 calls with independent UCUM membership checks. Across the compiled week, 4,306 calls carried an inline resource and 3,668 referenced an earlier session resource.

## Choosing data and terminology coverage

Preparation prints eligible and scorable **occurrences**, their operation and terminology mix, contributing packages and complete builds. It also writes those counts into `results/IG/workload.json`. Filter with comma-separated `PACKAGES`, `RELEASES`, `GROUPS_ALLOWED` or `SYSTEMS_ALLOWED`. Available groups are `snomed`, `loinc`, `rxnorm`, `ucum`, `bcp`, `hl7`, `other` and `unresolved`. A multi-system query is eligible only if every identified requirement passes. Systems are inferred from inputs, referenced local definitions and the recorded answer. A canonical can hide additional dependencies. Use the answer checks to confirm capability on the target.

`PROFILE=observed` retains the source's version controls. `PROFILE=core` repins supported operations to the Round 0 SNOMED International 20260201 or US 20260301 release, LOINC 2.82 and RxNorm 03022026. Unqualified SNOMED requests default to International. Set `SNOMED_EDITIONS=international` with this profile for a single edition. Foreign editions, conflicting controls and affected attachment definitions requiring review have separate exclusion counts. Pinning only affects known target systems. Changes to inputs invalidate their historical answer fingerprints. [Upstream data versions and requirements](../../site/src/pages/data.mdx)

Supply a private resource overlay for the broader workload. Each additional body must match the frozen SHA-256 of its canonical JSON representation. Materialize it from a saved capture, exact local terminology resource JSON files, or still-available published transcripts. The network option verifies the original transcript hash. A rebuilt branch can no longer supply its old transcript. Keep an authorized copy of the overlay to rerun the full workload offline.

```sh
mkdir -p results/IG
FETCH=1 bun scripts/publisher/hydrate.ts "$week" results/IG/assets.json.gz
# Alternatively, CAPTURE=/path/to/saved/capture or pass individual local FHIR resource files.
ASSETS=results/IG/assets.json.gz bun scripts/publisher/prepare.ts "$week" results/IG
```

The bundled definitions include compact selectors built from query operands and artifacts explicitly marked CC0. Other definition bodies, including third-party terminology lists, are identified by digest, canonical and source occurrence in the external asset index. Raw transcripts, full observed responses and original HTTP headers are kept out of the distribution.

## Interpreting a run

`publisher_operation_ms` measures HTTP duration for data requests. `publisher_matching_ms` and `publisher_mismatch_ms` separate responses according to their historical or reviewed semantic fingerprint. All three include p95. `publisher_build_ms` includes session setup, teardown and client work. k6 also reports transferred bytes. Use `--out json=results/IG/samples.json` for per-occurrence timings with operation, release, group and mode tags. Set `LOG_MISMATCH=1` to identify differing calls by package, transcript sequence, HTTP status and answer digest.

A publishable comparison should give the prepared workload hash, profile, eligible/scorable counts, completion, reference match rate and p95 together. Checkouts with different resource overlays can have very different operation mixes. An unavailable session is a failed check for each affected scorable call. A fast HTTP error cannot enter the matching p95. k6 exits nonzero on missing iterations, failed reference checks, failed independent membership checks or failed required cache control calls.

Historical agreement measures reproducibility across servers. Recorded servers can return incomplete or incorrect answers. Most checks compare selected semantics. Validation includes the typed result and returned code, system, display and inactive fields, plus structured issues on negative results. Expansion includes total when present, offset, nested members, versions, displays, flags and designations. Member order is ignored within a level and duplicates are retained. Batch validation preserves entry order. Search compares totals and returned canonical/version tuples. Lookup compares selected identity, display, designation and property fields. Optional fields and language choices can legitimately cause differences. Inspect discrepancies before calling them defects. Recorded errors and unparseable answers have an unscored lane. A separate membership metric checks simple code-only UCUM validations for five independently specified unit expressions. [UCUM specification, sections 4.1–4.3](https://ucum.org/ucum)

To establish expectations for changed pins, run the prepared profile against a reference deployment with the desired data installed. The script issues one stateless request per distinct changed input, sequentially, and saves projected candidate answers locally. Inspect the projections, resolve differences against the data and retain the reviewed entries in a separate JSON file. Preparation accepts the status, kind, digest and source keyed by the transformed request fingerprint.

```sh
PROFILE=core RELEASES=4.0 bun scripts/publisher/prepare.ts "$week" results/IG-core
SOURCE_LABEL='review server, release snapshot' REF_4_0=http://localhost:8081/fhir \
  bun scripts/publisher/reference.ts results/IG-core/workload.json results/IG-core/candidates.json
PROFILE=core RELEASES=4.0 REVIEWED=results/IG-core/reviewed.json \
  bun scripts/publisher/prepare.ts "$week" results/IG-core
```

## Generate another week

```sh
bun scripts/publisher/collect.ts 2026-11-18 /path/to/private-capture
bun scripts/publisher/generate.ts /path/to/private-capture results/new-week /path/to/private-assets.json.gz
bun test scripts/publisher/publisher.test.ts
bun scripts/publisher/smoke.ts
```

The date argument is the exclusive UTC end. The build index contains the latest visible entry for each branch. Earlier builds on a subsequently overwritten branch can be absent. Collection selects the latest visible build per package in the window and breaks timestamp ties by report path. It checks the package and build timestamp before and after downloading each transcript. Collection saves the index, source bytes and receipts privately. Generating again from the same capture reproduces the published pool hashes. [Publisher build index](https://build.fhir.org/ig/qas.json)

Each weekly directory has a readable manifest with source locations, SHA-256 digests and exclusions, plus four gzipped JSON pools. Requests are deduplicated by transport, release, normalized inputs, observed requirements and context. Build rows store the original sequence, request index, logical session slot, response status, projection kind and digest. Attached assets are deduplicated by content. The external asset index locates optional definitions. Requests with server-local resource IDs, missing input bodies and undecodable state are excluded. Corpus occurrence counts describe traffic visible in the published HTTP transcripts, including the effects of the Publisher's own client-side caches.
