.PHONY: setup build test test-db up down logs migrate db-status db-shell db-reset
setup:     ; cp -n .env.example .env || true; npm install
build:     ; npm run build
test:      ; npm run build && npm test
# Includes the database tests. Needs `make up` (or at least the postgres container) running.
test-db:   ; npm run build && TEST_DATABASE_URL=postgres://concerts:concerts@localhost:5432/postgres npm test
up:        ; docker compose up --build -d
down:      ; docker compose down
logs:      ; docker compose logs -f
migrate:   ; docker compose run --rm migrate node services/migrate/dist/index.js up seed
db-status: ; docker compose run --rm migrate node services/migrate/dist/index.js status
db-shell:  ; docker compose exec postgres psql -U concerts -d concerts
# DESTROYS all local data, then rebuilds the schema from scratch.
db-reset:  ; docker compose down -v && docker compose up --build -d
