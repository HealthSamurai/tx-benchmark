# Hermes/Hades (wardle)

- `http://localhost:7006/fhir`
- Hades 2.x — single binary subsuming Hermes (SNOMED) + LOINC + FHIR packages
- All terminologies served from one process, dispatched by the composite

## Building

The Dockerfile pins a specific [wardle/hades](https://github.com/wardle/hades)
release. Bump the `ADD` URL in the Dockerfile to move to a newer version.

```sh
docker compose build           # first build, or after `git pull`
docker compose build --pull    # force-refresh after bumping the pin
```

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

## CLI shape (Hades 2.x)

The hades service translates each on-disk artefact into a positional
path passed to `serve`:

```
java -Xmx8g -jar hades.jar serve --port 8080 \
  /var/hades/snomed.db \
  /var/hades/loinc.db \
  /var/hades/packages/hl7.fhir.r4.core-4.0.1/package \
  /var/hades/packages/hl7.terminology.r4-7.0.1/package \
  ...
```

FHIR packages are loaded **in-memory** rather than into SQLite — boot
takes ~15 s longer, but every CodeSystem / ValueSet / ConceptMap
lookup becomes a hashmap hit. With six standard HL7 packages this is
~600 MB of resident heap; the `-Xmx8g` ceiling gives comfortable
headroom for the in-memory data + Hermes' Lucene mmap caches +
transient `$expand` working sets. On RAM-constrained hosts, `hades
import fhir.db <pkg-dirs…>` and `serve … fhir.db` (instead of the
package directories) keeps the resident footprint to ~80 MB at the
cost of small per-request JDBC overhead — see the
[in-memory vs SQLite section](https://github.com/wardle/hades#in-memory-vs-sqlite-container)
in hades' README.

The build script (`build-databases.sh`) calls the underlying CLI directly:

```
hades import  <dest-db> <source-paths…>     # dest first, sources after
hades index   <dest-db>
hades compact <dest-db>
```

## Loading Terminologies

Place each artefact in `tx-benchmark/.tx-content/`. The builder is
idempotent — it skips packages already extracted and rebuilds the
SNOMED/LOINC DBs only when `REBUILD_DB=1` or the destination is empty.

## Known limitations

- **No RxNorm support.** The RxNorm test bucket of the capability matrix
  will be reported as unsupported by the preflight.
