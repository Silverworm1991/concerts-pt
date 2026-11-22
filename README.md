# concerts-pt

Microservices that collect concert data (names, venues, dates, prices) from
Portuguese ticketing sources into one searchable API.

## Quick start
```bash
make setup      # install deps, create .env
make test       # build + run tests
make up         # postgres + rabbitmq + api via Docker
curl localhost:3000/health
curl localhost:3000/ready
```
RabbitMQ UI: http://localhost:15672 (concerts / concerts)

## Layout
- `packages/shared`  config validation, logging, HTTP service skeleton (health/readiness, request IDs, graceful shutdown)
- `templates/service` template for new services
- `services/*`        one folder per microservice
- `tools/new-service.sh` scaffold a service: `npm run new-service -- scheduler`

## Conventions
- **Config:** env vars only, validated at startup (`loadConfig`).
- **Logs:** JSON to stdout, always with `service`; HTTP requests carry `x-request-id`.
- **Health:** `/health` = alive, `/ready` = dependencies reachable.
- **Docker:** single Dockerfile, `--build-arg SERVICE=<name>`.
- **CI:** build (type-check) + tests on every PR, Docker build per service.

## Adding a service
1. `npm run new-service -- <name>` then `npm install`
2. Add a block to `docker-compose.yml` (copy `api`) and the CI matrix
