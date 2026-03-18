# Findings

Server-specific behaviours and spec compliance gaps discovered during benchmarking.
Each entry includes the affected servers, the relevant spec reference, and reproduction steps.

---

## EX07 — `not-in` filter with comma-separated values rejected

**Affected servers:** Ontoserver, FHIRsmith
**Test:** EX07 (`ValueSet/$expand` — SNOMED hierarchy filters)
**Status:** Pool entries removed

### Description

The FHIR spec defines the `not-in` filter operator value as a comma-separated list of codes:

> "The specified property of the code is not in the set of codes or concepts specified in the provided value (comma-separated list)."
>
> — https://build.fhir.org/valueset-filter-operator.html

Both Ontoserver and FHIRsmith reject requests where the `not-in` value contains a comma-separated list, returning HTTP 422 with an ECL parse error. The reference server (tx.fhir.org) also rejects these, suggesting this is a broadly unsupported pattern.

### Error responses

**Ontoserver (`r4.ontoserver.csiro.au` and `tx.health-samurai.io`):**
```
Invalid concept / post-coordinated expression: line 1:17 mismatched input ',' expecting <EOF>
```

**tx.fhir.org (reference server):**
```
Invalid concept ID: 11864921000119108,445654004,394850002,93252006
```

### Reproduction

```bash
curl -X POST https://r4.ontoserver.csiro.au/fhir/ValueSet/\$expand \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "valueSet",
        "resource": {
          "resourceType": "ValueSet",
          "compose": {
            "include": [{
              "system": "http://snomed.info/sct",
              "filter": [
                { "property": "concept", "op": "descendent-of", "value": "88878007" },
                { "property": "concept", "op": "not-in", "value": "11864921000119108,445654004,394850002,93252006" }
              ]
            }]
          }
        }
      },
      { "name": "count", "valueInteger": 10 }
    ]
  }'
```

---

## EX07 — `exists` filter operator broadly unsupported

**Affected servers:** Ontoserver, FHIRsmith, tx.fhir.org (reference)
**Test:** EX07 (`ValueSet/$expand` — SNOMED hierarchy filters)
**Status:** Pool entries removed

### Description

The `exists` filter operator (used to filter concepts that have a given relationship property) is rejected by all tested servers, including the HL7 reference server at tx.fhir.org.

### Error responses

**Ontoserver (`r4.ontoserver.csiro.au` and `tx.health-samurai.io`):**
```
Invalid concept / post-coordinated expression: parse error
```

**tx.fhir.org (reference server):**
```
Unsupported filter property: 116676008
```

### Reproduction

```bash
curl -X POST https://r4.ontoserver.csiro.au/fhir/ValueSet/\$expand \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "valueSet",
        "resource": {
          "resourceType": "ValueSet",
          "compose": {
            "include": [{
              "system": "http://snomed.info/sct",
              "filter": [
                { "property": "116676008", "op": "exists", "value": "true" }
              ]
            }]
          }
        }
      },
      { "name": "count", "valueInteger": 10 }
    ]
  }'
```
