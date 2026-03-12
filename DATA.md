# Data

All servers are loaded with the same terminology datasets before benchmarking.
This document covers license requirements, where to obtain each dataset, and load instructions.

## Datasets

### SNOMED CT International Edition

- **License:** SNOMED CT license required. Available free of charge to individuals and organizations in SNOMED International member countries. See [SNOMED International Licensing](https://www.snomed.org/get-snomed).
- **Download:** [SNOMED International Member Licensing and Distribution Service (MLDS)](https://mlds.ihtsdotools.org/)
- **File format:** RF2 release package
- **Load instructions:** _TODO_

### SNOMED CT US Edition

- **License:** SNOMED CT license required (as above) plus US Member license (included automatically for US-based users).
- **Download:** [National Library of Medicine (NLM)](https://www.nlm.nih.gov/healthit/snomedct/us_edition.html) or MLDS
- **File format:** RF2 release package
- **Load instructions:** _TODO_

### SNOMED CT UK Edition

- **License:** SNOMED CT license required (as above) plus UK Member license.
- **Download:** [NHS Digital TRUD](https://isd.digital.nhs.uk/trud/users/authenticated/filters/0/categories/26/items/101/releases) (registration required)
- **File format:** RF2 release package
- **Load instructions:** _TODO_

### LOINC

- **License:** Free. Requires registration and acceptance of the LOINC license.
- **Download:** [loinc.org/downloads](https://loinc.org/downloads/)
- **File format:** LOINC Table (CSV) and FHIR package
- **Load instructions:** _TODO_

### RxNorm

- **License:** Free. NLM requires registration for full release download.
- **Download:** [NLM RxNorm](https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html)
- **File format:** RRF files
- **Load instructions:** _TODO_

### FHIR Packages

The following FHIR packages are loaded via standard FHIR package tooling:

| Package | Registry |
|---------|----------|
| `hl7.terminology.r4` (THO) | [packages.fhir.org](https://packages.fhir.org) |
| `hl7.fhir.r4.core` | [packages.fhir.org](https://packages.fhir.org) |
| `hl7.fhir.us.core` | [packages.fhir.org](https://packages.fhir.org) |
| `hl7.fhir.us.vsac` | [packages.fhir.org](https://packages.fhir.org) |
| `hl7.fhir.uv.ips` | [packages.fhir.org](https://packages.fhir.org) |
| `us.cdc.phinvads` | [packages.fhir.org](https://packages.fhir.org) |
| `hl7.fhir.uv.tx-ecosystem` (tx.support) | [packages.fhir.org](https://packages.fhir.org) |

- **License:** HL7 FHIR Specification License (open). Individual value sets may carry additional license terms (e.g., VSAC content requires UMLS license).
- **Load instructions:** _TODO_
