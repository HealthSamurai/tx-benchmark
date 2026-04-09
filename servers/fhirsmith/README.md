# FHIRSmith (Health Intersections)

- `http://localhost:7003/tx/r4`
- Internet access required on startup

## Running

```sh
docker compose up --build
```

## Loading Terminologies

FHIRSmith downloads pre-built terminology caches automatically on first startup
from the public GCS bucket (`https://storage.googleapis.com/tx-fhir-org/`),
including SNOMED CT (20250201), LOINC (2.81), and RxNorm. Sources are configured
in `library.yml`. FHIR npm packages are also fetched on first run.
