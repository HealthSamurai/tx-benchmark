# Terminology Servers Benchmark

## Prerequisites

- Docker
  - 20GB RAM
  - 8 cores CPU

## Servers

| Server                           | Endpoint                      |
| -------------------------------- | ----------------------------- |
| [FHIRSmith](./fhirsmith/)        | `http://localhost:7003/tx/r4` |
| [Hermes/Hades](./hades/)         | `http://localhost:7006/fhir`  |
| [Ontoserver](./ontoserver/)      | `http://localhost:7002/fhir`  |
| [Snowstorm](./snowstorm/)        | `http://localhost:7005/fhir`  |
| [Termbox](./termbox/)            | `http://localhost:7001/fhir`  |

## Terminologies

| Terminology                | Type             |
| -------------------------- | ---------------- |
| snomed-int                 | Binary / RF2     |
| snomed-us                  | Binary / RF2     |
| snomed-uk                  | Binary / RF2     |
| loinc                      | Binary / Archive |
| rxnorm                     | Binary / Archive |
| hl7.fhir.r4.core-4.0.1.tgz | FHIR package     |
| hl7.terminology-7.0.1.tgz  | FHIR package     |
| hl7.fhir.us.core-6.1.0.tgz | FHIR package     |
| us.nlm.vsac-0.24.0.tgz     | FHIR package     |
| hl7.fhir.uv.ips-2.0.0.tgz  | FHIR package     |
| us.cdc.phinvads-0.12.0.tgz | FHIR package     |
| hl7.fhir.uv.ips-1.1.0.tgz  | FHIR package     |
