# Server configurations

Each server is listed with the version tested, runtime environment, and any configuration relevant to the benchmark. Settings not mentioned here are left at their defaults.

## Container naming convention

All servers run as Docker containers. Each container must be named after its server identifier (as used in `servers.json`) so that cAdvisor metrics can be correlated with k6 benchmark metrics in Grafana.

| Server | Container name |
|--------|---------------|
| FHIRsmith | `fhirsmith` |
| Hermes | `hermes` |
| Ontoserver | `ontoserver` |
| Reference Server | `reference-server` |
| Snowstorm | `snowstorm` |
| Termbox | `termbox` |

Example:
```bash
docker run --name termbox ...
```

cAdvisor will then expose metrics such as `container_memory_usage_bytes{name="termbox"}`, which can be filtered in Grafana alongside k6 metrics tagged with `server=termbox`.

---

## FHIRsmith

- **Source:** https://github.com/HealthIntersections/FHIRsmith
- **Version:** TBD
- **Runtime:** TBD
- **Configuration:** TBD

---

## Hermes

- **Source:** https://github.com/wardle/hermes
- **Version:** TBD
- **Runtime:** TBD
- **Configuration:** TBD

---

## Ontoserver

- **Source:** https://ontoserver.csiro.au
- **Version:** TBD
- **Runtime:** TBD
- **Configuration:** TBD

---

## Reference Server

- **Source:** https://github.com/HealthIntersections/fhirserver
- **Version:** TBD
- **Runtime:** TBD
- **Configuration:** TBD

---

## Snowstorm

- **Source:** https://github.com/IHTSDO/snowstorm
- **Version:** TBD
- **Runtime:** TBD
- **Configuration:** TBD

---

## Termbox

- **Source:** https://health-samurai.io
- **Version:** TBD
- **Runtime:** TBD
- **Configuration:** TBD
