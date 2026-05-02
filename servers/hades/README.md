# Hermes/Hades (wardle)

- `http://localhost:7006/fhir`
- Hades 2.x — single binary subsuming Hermes (SNOMED) + LOINC + FHIR packages
- All terminologies served from one process, dispatched by the composite

## Running

```sh
docker compose up --build
```

The builder service consumes everything under `../../.tx-content/`:

| Source artefact in `.tx-content/`     | Output in volume `hades-data`        |
| ------------------------------------- | ------------------------------------ |
| `SnomedCT_*.zip`                      | `/var/hades/snomed.db` (Hermes)      |
| `Loinc_*.zip` / `loinc-*.zip`         | `/var/hades/loinc.db` (FTRM SQLite)  |
| `*.tgz` (FHIR NPM packages)           | `/var/hades/packages/<id>-<ver>/`    |

Multiple SNOMED zips (intl, US, UK) are imported into the same Hermes DB —
the composite serves each module/version distinctly.

The hades service then auto-discovers every DB and every extracted package
directory at start-up:

```
java -jar hades.jar serve --port 8080 \
  --db /var/hades/snomed.db \
  --db /var/hades/loinc.db \
  --resources /var/hades/packages/hl7.fhir.r4.core-4.0.1 \
  --resources /var/hades/packages/hl7.terminology.r4-7.0.1 \
  ...
```

FHIR packages are loaded **in-memory** rather than into SQLite — boot
takes ~15 s longer, but every CodeSystem/ValueSet/ConceptMap lookup
becomes a hashmap hit. Worth it for benchmark territory.

## Loading Terminologies

Place each artefact in `tx-benchmark/.tx-content/`. The builder is
idempotent — it skips packages already extracted and rebuilds the
SNOMED/LOINC DBs only when `REBUILD_DB=1` or the destination is empty.
