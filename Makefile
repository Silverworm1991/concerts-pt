.PHONY: setup up down logs test build
setup:   ; cp -n .env.example .env || true; npm install
build:   ; npm run build
test:    ; npm run build && npm test
up:      ; docker compose up --build -d
down:    ; docker compose down
logs:    ; docker compose logs -f
