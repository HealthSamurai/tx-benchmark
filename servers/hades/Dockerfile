FROM eclipse-temurin:25-jre

RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/hermes /opt/hades /opt/scripts /var/hermes

ADD https://github.com/wardle/hermes/releases/download/v1.4.1607/hermes-1.4.1607.jar /opt/hermes/hermes.jar
ADD https://github.com/wardle/hades/releases/download/v1.4.138/hades-1.4.138.jar /opt/hades/hades.jar

COPY build-snomed-db.sh /opt/scripts/build-snomed-db.sh
RUN chmod +x /opt/scripts/build-snomed-db.sh

EXPOSE 8080
