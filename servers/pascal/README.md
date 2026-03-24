# Pascal / FHIRServer (Health Intersections)

- `http://localhost:7004/r4`

## Setup

Clone the upstream FHIRServer source into `./upstream/`:

```sh
git clone https://github.com/HealthIntersections/fhirserver.git upstream
git -C upstream checkout ec46dff3  # v4.0.7
```

## Running

```sh
docker compose up --build -d
```

## Loading Terminologies

Refer to the documentation