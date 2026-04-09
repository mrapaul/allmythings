#!/usr/bin/env bash
set -euo pipefail
python3 scripts/seed_prompts.py
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U allmythings -d allmythings -t -c \
  "SELECT prompt_name, version, status FROM prompts_catalog ORDER BY prompt_name;" \
  > /tmp/seeds.txt
grep -q "gatekeeper_interior.*1.*active" /tmp/seeds.txt
grep -q "qwen_enumerate.*1.*active" /tmp/seeds.txt
grep -q "qwen_attributes.*1.*active" /tmp/seeds.txt
grep -q "molmo_points.*1.*active" /tmp/seeds.txt
grep -q "taxonomy_learn.*1.*active" /tmp/seeds.txt
echo "PROMPTS_SEED_OK"
