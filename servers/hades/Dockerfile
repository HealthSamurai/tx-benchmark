FROM eclipse-temurin:25-jre

# unzip — RF2 + LOINC archives
# tar  — FHIR NPM packages
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip tar \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/hades /opt/scripts /var/hades

# Hades 2.x ships a single uberjar that subsumes Hermes' CLI (import,
# index, compact, status, available, install) and adds FHIR-package
# ingestion via SQLite or in-memory (--resources). One binary, multi-DB.
ARG HADES_VERSION=2.0.0
ADD https://github.com/wardle/hades/releases/download/v${HADES_VERSION}/hades-${HADES_VERSION}.jar /opt/hades/hades.jar

COPY build-databases.sh /opt/scripts/build-databases.sh
RUN chmod +x /opt/scripts/build-databases.sh

EXPOSE 8080
