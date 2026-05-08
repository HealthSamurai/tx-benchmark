#!/bin/sh
set -eu

DB_ROOT="${DB_ROOT:-/var/hades}"
SNOMED_DB="${DB_ROOT}/snomed.db"
LOINC_DB="${DB_ROOT}/loinc.db"
PKG_DIR="${DB_ROOT}/packages"

SOURCE="${SOURCE_DIR:-/source-data}"
HADES="${HADES:-java -jar /opt/hades/hades.jar}"

if [ "${REBUILD_DB:-0}" = "1" ]; then
  rm -rf "${SNOMED_DB}" "${LOINC_DB}" "${PKG_DIR}"
fi

mkdir -p "${DB_ROOT}" "${PKG_DIR}"

EXTRACT_DIR="$(mktemp -d)"
trap 'rm -rf "${EXTRACT_DIR}"' EXIT

found_snomed=0
for zip in "${SOURCE}"/SnomedCT_*.zip "${SOURCE}"/snomed-*.zip "${SOURCE}"/uk_sct*.zip; do
  [ -f "${zip}" ] || continue
  found_snomed=1
  echo "Extracting ${zip}..."
  unzip -qo "${zip}" -d "${EXTRACT_DIR}"
done

if [ "${found_snomed}" = "1" ]; then
  # Hermes walks the extract dir recursively, so one import call subsumes
  # every edition regardless of how each zip was wrapped (MLDS, TRUD bundle).
  echo "Importing SNOMED ${EXTRACT_DIR} -> ${SNOMED_DB}"
  ${HADES} import  "${SNOMED_DB}" "${EXTRACT_DIR}"
  ${HADES} compact "${SNOMED_DB}"
fi

found_loinc=0
for zip in "${SOURCE}"/Loinc_*.zip "${SOURCE}"/loinc-*.zip; do
  [ -f "${zip}" ] || continue
  loinc_dir="${EXTRACT_DIR}/$(basename "${zip}" .zip)"
  if [ ! -d "${loinc_dir}/LoincTableCore" ] && [ ! -d "${loinc_dir}/LoincTable" ]; then
    echo "Extracting ${zip}..."
    mkdir -p "${loinc_dir}"
    unzip -qo "${zip}" -d "${loinc_dir}"
  fi
  echo "Importing LOINC ${loinc_dir} -> ${LOINC_DB}"
  ${HADES} import "${LOINC_DB}" "${loinc_dir}"
  found_loinc=1
done

for dir in "${SOURCE}"/Loinc_*/ "${SOURCE}"/loinc-*/; do
  [ -d "${dir}" ] || continue
  if [ -d "${dir}/LoincTableCore" ] || [ -d "${dir}/LoincTable" ]; then
    echo "Importing LOINC ${dir} -> ${LOINC_DB}"
    ${HADES} import "${LOINC_DB}" "${dir}"
    found_loinc=1
  fi
done

if [ "${found_loinc}" = "1" ]; then
  ${HADES} compact "${LOINC_DB}"
fi

# FHIR packages are loaded in-memory at serve time, not pre-built into a DB.
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
