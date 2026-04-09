#!/usr/bin/env bash
set -euo pipefail
# Must run from repo root
docker compose -f docker-compose.dev.yml up -d postgres minio nats
# Wait for Postgres ready
for i in {1..30}; do
  if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U allmythings; then
    echo "Postgres ready"; break
  fi
  sleep 2
done
# Confirm pgvector extension is loadable
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U allmythings -d allmythings -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT 'vector ok';"
# Confirm MinIO health
curl -fsS http://localhost:9000/minio/health/live
# Confirm NATS JetStream enabled
docker compose -f docker-compose.dev.yml exec -T nats nats --server nats://localhost:4222 stream ls || true
echo "STACK_UP_OK"
