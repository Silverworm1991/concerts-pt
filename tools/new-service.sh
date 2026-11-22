#!/usr/bin/env bash
# Usage: npm run new-service -- <name>   (e.g. scheduler, normalizer, collector-ticketline)
set -euo pipefail
NAME="${1:?usage: new-service <name>}"
DEST="services/$NAME"
[ -e "$DEST" ] && { echo "$DEST already exists"; exit 1; }
cp -r templates/service "$DEST"
grep -rl "__NAME__" "$DEST" | xargs sed -i "s/__NAME__/$NAME/g"
echo "Created $DEST"
echo "Next: run 'npm install', then add a '$NAME' block to docker-compose.yml"
