#!/usr/bin/env bash
set -euo pipefail
bash tests/db/test_base_schema.sh
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U allmythings -d allmythings -c "\dt public.*" > /tmp/tables.txt
for t in feedback_events memory_bank active_learning_queue taxonomy_category prompts_catalog audit_log; do
  grep -q "$t" /tmp/tables.txt || { echo "Missing: $t"; exit 1; }
done

# Verify HNSW index on memory_bank
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U allmythings -d allmythings -c "\di memory_bank_hnsw" | grep -q memory_bank_hnsw

echo "FULL_SCHEMA_OK"
