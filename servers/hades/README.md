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
| `*.tgz` (FHIR NPM packages)           | `/var/hades/fhir.db` (FTRM SQLite)   |

Multiple SNOMED zips (intl, US, UK) are imported into the same Hermes DB —
the composite serves each module/version distinctly.

## CLI shape (Hades 2.x)

The hades service translates each on-disk artefact into a positional
path passed to `serve`:

```
java -Xmx8g -jar hades.jar serve --port 8080 \
  /var/hades/snomed.db \
  /var/hades/loinc.db \
  /var/hades/fhir.db
```

FHIR packages are built into a single **FTRM SQLite container**
(`fhir.db`) rather than served in-memory. SQLite is mmap'd, so the
*corpus at rest* lives off-heap, and the indexed/FTS query paths are
faster than scanning an in-memory corpus on search and intensional
`$expand`. Heap is still sized at `-Xmx8g`, though: `$expand` builds
each result set in heap to serialize it, so concurrent large
expansions (e.g. 200k-member VSAC/PHINVADS value sets) need multiple
GB regardless of where the corpus is stored — a measured ~6 GB working
set for 30 concurrent large expansions. The in-memory alternative —
serving the unpacked package directories instead of `fhir.db` — trades
that for hashmap-hit lookups and is the right choice only on large-RAM
hosts or for request-scoped overlays; see the
[in-memory vs SQLite section](https://github.com/wardle/hades#in-memory-vs-sqlite-container)
in hades' README.

The build script (`build-databases.sh`) calls the underlying CLI directly:

```
hades import  <dest-db> <source-paths…>     # dest first, sources after
hades index   <dest-db>
hades compact <dest-db>
```

## Loading Terminologies

Place each artefact in `tx-benchmark/.tx-content/`. Set `REBUILD_DB=1`
to drop and rebuild `snomed.db` / `loinc.db` / `fhir.db` from scratch;
otherwise the builder imports into whatever containers already exist.

## Known limitations

- **No RxNorm support.** The RxNorm test bucket of the capability matrix
  will be reported as unsupported by the preflight.
