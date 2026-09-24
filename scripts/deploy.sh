#!/usr/bin/env bash
# Deploys the current checkout on the VPS: rebuilds the frontend (served
# statically by the host nginx) and the backend container, then applies the
# (idempotent) schema.
#
# The checkout itself is updated by the caller *before* this runs (see
# .github/workflows/deploy.yml), so that bash never executes a copy of this
# file that git is rewriting underneath it. By hand, on the VPS:
#   git fetch origin && git reset --hard origin/main && ./scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "==> Installing dependencies"
npm ci --no-audit --no-fund

echo "==> Building frontend"
npm run build:frontend

echo "==> Rebuilding and restarting backend"
$COMPOSE up -d --build --remove-orphans

echo "==> Applying database schema"
$COMPOSE exec -T backend node dist/db/migrate.js

echo "==> Pruning dangling images"
docker image prune -f >/dev/null

echo "==> Deployed $(git rev-parse --short HEAD)"
