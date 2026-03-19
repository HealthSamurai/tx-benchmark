# Methodology

## Test environment

<!-- TODO: document final hardware spec (Linux bare-metal or VM) -->

- **OS:** TBD (Linux)
- **CPU:** TBD
- **RAM:** TBD
- **Disk:** TBD
- **Network:** All servers and the k6 runner on the same host (loopback only, no network latency)
- **FHIR version:** R4

Each server is benchmarked in isolation — one server running at a time.

## Server configuration

Each server is documented in [SERVERS.md](SERVERS.md), including version, runtime, and any configuration changes from defaults.

## Two-phase approach

### Phase 1 — Preflight

Before benchmarking, a correctness check is run against each server for each test case. This verifies that the server returns a semantically correct response (right resource type, expected parameters, correct values). Tests that a server fails or does not support are excluded from that server's benchmark run and recorded in the compatibility matrix.

Preflight results are stored in [`results/{server}/preflight.json`](results/).

### Phase 2 — Benchmark

Only tests that passed preflight are included. Each test runs at three concurrency levels:

| Level | Virtual users | Duration |
|-------|--------------|----------|
| Low   | 1  | 30s |
| Mid   | 10 | 30s |
| High  | 50 | 30s |

## Warm-up

Before measurement, a warm-up pass runs for 5 seconds at 10 VUs. This allows JIT compilers (notably the JVM) and connection pools to reach steady state before results are recorded.

## Input pools

Each test draws inputs randomly from a pool of 2,000+ entries per code system, ensuring a realistic working-set scenario rather than repeatedly testing a single code or value set.

## Metrics

| Metric | Description |
|--------|-------------|
| `http_req_duration` p50/p95/p99 | Request latency distribution |
| `http_reqs` rate | Throughput (requests per second) |
| `http_req_failed` rate | Error rate under load |
| CPU usage | Continuous measurement via cAdvisor (Docker) or process monitor (native) |
| Memory usage | Continuous measurement via cAdvisor (Docker) or process monitor (native) |
| Idle memory footprint | Snapshot before benchmark starts |

## Composite score

Each server receives a single composite score (0–100) computed from its benchmark results:

1. **Per-test effective RPS** — `throughput × (1 − error_rate)`, taking the maximum across VU levels (1, 10, 50).
2. **Normalizing weight per test** — `avg_rps_LK01 / avg_rps_of_test`, where averages are across all servers in the run. LK01 (simple SNOMED lookup) is the reference. This keeps all contributions in RPS units regardless of a test's natural throughput scale.
3. **Weighted sum** — `Σ (effective_rps × weight × bias)` across all tests the server participated in. Bias coefficients (see `scripts/lib/bias.ts`) default to 1.0 and can be tuned per test.
4. **Normalization** — the top server's raw score becomes 100%; all others are expressed as a percentage of that.

Servers that did not participate in a test receive an imputed effective RPS (p20 of participating servers) for that test's contribution to their score.

## Exclusions

A server is excluded from a test category if:

- It returned HTTP 404 or 501 for the operation in preflight
- It returned a semantically incorrect response in preflight

Exclusions are recorded in the compatibility matrix and noted in results.
