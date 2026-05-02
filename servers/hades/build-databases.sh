#!/bin/sh
# Build all on-disk databases Hades will serve from /source-data into /var/hades.
#
# /source-data convention (mounted from ../../.tx-content):
#   *.zip                         — SNOMED RF2 release zips (one per edition)
#   loinc-*.zip                   — LOINC release archive
#   *.tgz                         — FHIR NPM packages (kept for in-memory load)
#
# Outputs:
#   /var/hades/snomed.db          — single Hermes DB containing every imported
#                                   SNOMED edition (composite naturally serves
#                                   each module/version)
#   /var/hades/loinc.db           — Hades SQLite container (FTRM)
#   /var/hades/packages/<id>-<ver>/  — extracted FHIR packages, loaded
#                                       in-memory at serve time via --resources
#
# REBUILD_DB=1 forces a clean rebuild. The script is otherwise idempotent
# (skips files already imported / extracted).

set -eu

DB_ROOT="${DB_ROOT:-/var/hades}"
SNOMED_DB="${DB_ROOT}/snomed.db"
LOINC_DB="${DB_ROOT}/loinc.db"
PKG_DIR="${DB_ROOT}/packages"

SOURCE="${SOURCE_DIR:-/source-data}"

if [ "${REBUILD_DB:-0}" = "1" ]; then
  rm -rf "${SNOMED_DB}" "${LOINC_DB}" "${PKG_DIR}"
fi

mkdir -p "${DB_ROOT}" "${PKG_DIR}"

# ---------------------------------------------------------------------------
# SNOMED RF2 — every SnomedCT_*.zip in /source-data, imported into one DB.
# ---------------------------------------------------------------------------

EXTRACT_DIR="$(mktemp -d)"
trap 'rm -rf "${EXTRACT_DIR}"' EXIT

found_snomed=0
for zip in "${SOURCE}"/SnomedCT_*.zip; do
  [ -f "${zip}" ] || continue
  found_snomed=1
  echo "Extracting ${zip}..."
  unzip -qo "${zip}" -d "${EXTRACT_DIR}"
done

if [ "${found_snomed}" = "1" ]; then
  for dir in "${EXTRACT_DIR}"/SnomedCT_*; do
    [ -d "${dir}" ] || continue
    echo "Importing SNOMED ${dir} -> ${SNOMED_DB}"
    java -jar /opt/hades/hades.jar import --db "${SNOMED_DB}" "${dir}"
  done
  java -jar /opt/hades/hades.jar index --db "${SNOMED_DB}"
  java -jar /opt/hades/hades.jar compact --db "${SNOMED_DB}"
fi

# ---------------------------------------------------------------------------
# LOINC — release archive (auto-detected by content, not filename).
# ---------------------------------------------------------------------------

for zip in "${SOURCE}"/Loinc_*.zip "${SOURCE}"/loinc-*.zip; do
  [ -f "${zip}" ] || continue
  loinc_dir="${EXTRACT_DIR}/$(basename "${zip}" .zip)"
  if [ ! -d "${loinc_dir}/LoincTableCore" ]; then
    echo "Extracting ${zip}..."
    mkdir -p "${loinc_dir}"
    unzip -qo "${zip}" -d "${loinc_dir}"
  fi
  echo "Importing LOINC ${loinc_dir} -> ${LOINC_DB}"
  java -jar /opt/hades/hades.jar import --db "${LOINC_DB}" "${loinc_dir}"
done

# ---------------------------------------------------------------------------
# FHIR NPM packages — extracted but NOT pre-built; loaded in-memory at serve
# time. tx-benchmark's compose step boots once and serves until torn down,
# so the one-off parse cost is amortised across the whole run.
# ---------------------------------------------------------------------------

for tgz in "${SOURCE}"/*.tgz; do
  [ -f "${tgz}" ] || continue
  name="$(basename "${tgz}" .tgz)"
  dest="${PKG_DIR}/${name}"
  if [ ! -d "${dest}" ]; then
    mkdir -p "${dest}"
    echo "Extracting FHIR package ${tgz} -> ${dest}"
    tar xzf "${tgz}" -C "${dest}"
  fi
done

ls -la "${DB_ROOT}"
