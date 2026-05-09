FROM eclipse-temurin:25-jre

# unzip — RF2 + LOINC archives
# tar  — FHIR NPM packages
RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip tar \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/hades /opt/scripts /var/hades

# Hades 2.x: single uberjar covering import / index / compact / serve for
# SNOMED, LOINC and FHIR packages.
ADD https://github.com/wardle/hades/releases/download/v2.0.198/hades.jar /opt/hades/hades.jar

COPY build-databases.sh /opt/scripts/build-databases.sh
RUN chmod +x /opt/scripts/build-databases.sh

EXPOSE 8080
