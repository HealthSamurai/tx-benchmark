# FHIR Terminology Server Benchmark

A benchmark comparing the performance of open-source and commercial FHIR Terminology servers across a range of standard FHIR terminology operations.

## Servers

| Server | Version |
|--------|---------|
| [FHIRsmith](https://github.com/HealthIntersections/FHIRsmith) | TBD |
| [Hermes](https://github.com/wardle/hermes) | TBD |
| [Ontoserver](https://ontoserver.csiro.au) | TBD |
| [Reference Server](https://github.com/HealthIntersections/fhirserver) | TBD |
| [Snowstorm](https://github.com/IHTSDO/snowstorm) | TBD |
| [Termbox](https://health-samurai.io) | TBD |

## Test categories

| Prefix | Category | FHIR operation |
|--------|----------|----------------|
| `LK` | Lookup | `CodeSystem/$lookup` |
| `VC` | Validate code | `CodeSystem/$validate-code`, `ValueSet/$validate-code` |
| `EX` | Expand | `ValueSet/$expand` |
| `TR` | Translate | `ConceptMap/$translate` |
| `SB` | Subsumes | `CodeSystem/$subsumes` |
| `FT` | Full-text search | `ValueSet/$expand` with text filter |
| `FL` | Filters / implicit value sets | `ValueSet/$expand` with property filters |
| `CQ` | Complex queries | Multi-parameter expansions, large hierarchies |

Not all servers support all operations. Servers that do not support a given operation are excluded from that category. See [preflight results](preflight/results/) for the per-server compatibility matrix.

## Data

The following terminology datasets are loaded before running the benchmark:

- SNOMED CT International Edition
- SNOMED CT US Edition
- SNOMED CT UK Edition
- LOINC
- RxNorm
- FHIR THO, r4.core, us.core, vsac, tx.support, IPS, CDC PHINVADS

See [DATA.md](DATA.md) for license requirements and load instructions.

## Prerequisites

- [k6](https://k6.io/docs/getting-started/installation/)
- [Docker](https://docs.docker.com/get-docker/) (for the observability stack)
- [jq](https://stedolan.github.io/jq/)

## Running

### 1. Start the observability stack

```bash
cd observability && docker compose up -d
```

### 2. Load data into the server under test

See [DATA.md](DATA.md).

### 3. Run

```bash
./scripts/run.sh <server> <base-url>

# Example
./scripts/run.sh termbox http://localhost:7001/fhir
```

This will:
1. Run preflight correctness checks and record a compatibility matrix
2. Take an idle resource snapshot
3. Run a warm-up pass (results discarded)
4. Benchmark at VUs=1, 10, 50 for each supported test

### 4. View results

Open Grafana at [http://localhost:3000](http://localhost:3000). Import the [k6 dashboard](https://grafana.com/grafana/dashboards/18030) from Grafana's dashboard library.

## Methodology

See [METHODOLOGY.md](METHODOLOGY.md).
