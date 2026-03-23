// Bias coefficients per test.
// Adjust to up/down-weight individual tests in the composite score.

export const BIAS: Record<string, number> = {
  FS01: 0.4, // FHIR Search (CodeSystem, ValueSet)

  LK01: 1.0, // Lookup on SNOMED
  LK02: 0.9, // Lookup on LOINC
  LK03: 0.9, // Lookup on mixed FHIR package codes
  LK04: 0.9, // Lookup on RxNorm
  LK05: 1.0, // Lookup on SNOMED — not-found/negative codes

  VC01: 1.0, // Validate code — SNOMED implicit ValueSet, code only
  VC02: 1.0, // Validate code — SNOMED implicit ValueSet, code + display
  VC03: 1.0, // Validate code — SNOMED isa hierarchies

  EX01: 1.0, // Expand — SNOMED Clinical Finding hierarchy, count + offset
  EX02: 1.0, // Expand — SNOMED hierarchy filters
  EX03: 1.0, // Expand — SNOMED basic text filter
  EX04: 0.9, // Expand — VSAC ValueSets
  EX05: 1.0, // Expand — SNOMED ValueSet filters
  EX06: 0.9, // Expand — RxNorm ValueSet filters
  EX07: 0.9, // Expand — Multi system search
  EX08: 1.0, // Expand — SNOMED combined filters

  SS01: 0.6, // Subsumes — SNOMED CT hierarchy

  CM01: 0.8, // Translate — SNOMED implicit REPLACED BY map (intra-SNOMED)
  CM02: 0.8, // Translate — package ConceptMaps
};
