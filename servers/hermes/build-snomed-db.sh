#!/bin/sh
set -eu

DB_ROOT="${DB_ROOT:-/var/hermes}"
DB_PATH="${DB_ROOT}/snomed.db"

INT_ZIP="/source-data/SnomedCT_InternationalRF2_PRODUCTION_20260201T120000Z.zip"
US_ZIP="/source-data/SnomedCT_ManagedServiceUS_PRODUCTION_US1000124_20260301T120000Z.zip"
UK_ZIP="/source-data/SnomedCT_UKClinicalRF2_PRODUCTION_20260211T000001Z.zip"

if [ "${REBUILD_DB:-0}" = "1" ] && [ -d "${DB_PATH}" ]; then
  rm -rf "${DB_PATH}"
fi

EXTRACT_DIR="/tmp/rf2"

mkdir -p "${DB_ROOT}" "${EXTRACT_DIR}"

for zip in "${INT_ZIP}" "${US_ZIP}" "${UK_ZIP}"; do
  if [ ! -f "${zip}" ]; then
    echo "missing source file: ${zip}" >&2
    exit 1
  fi
  echo "Extracting ${zip}..."
  unzip -qo "${zip}" -d "${EXTRACT_DIR}"
done

for dir in "${EXTRACT_DIR}"/SnomedCT_*; do
  echo "Importing ${dir}..."
  java -jar /opt/hermes/hermes.jar --db "${DB_PATH}" import "${dir}"
done

rm -rf "${EXTRACT_DIR}"
java -jar /opt/hermes/hermes.jar --db "${DB_PATH}" index compact
