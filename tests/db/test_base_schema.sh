#!/usr/bin/env bash
set -euo pipefail
docker run --rm --network allmythings-dev_allmythings-dev \
  -v "$(pwd)/db:/db" -w /db \
  --env-file db/dbmate.env \
  ghcr.io/amacneil/dbmate:2.25 up

# Verify tables exist
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U allmythings -d allmythings -c "\dt public.*" | tee /tmp/tables.txt
grep -q "tenants" /tmp/tables.txt
grep -q "users" /tmp/tables.txt
grep -q "images" /tmp/tables.txt
grep -q "jobs" /tmp/tables.txt
grep -q "detections" /tmp/tables.txt
echo "BASE_SCHEMA_OK"
