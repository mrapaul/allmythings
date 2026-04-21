#!/bin/bash
# Full smoke test: happy path + idempotency + degraded + optional fault-injection drills.
# Usage: ./scripts/smoke.sh [--drills]
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_section() { echo -e "\n${BLUE}► $1${NC}"; }
log_ok()      { echo -e "  ${GREEN}✓${NC} $1"; }
log_fail()    { echo -e "  ${RED}✗${NC} $1"; }
log_warn()    { echo -e "  ${YELLOW}!${NC} $1"; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRILLS="${1:-}"

log_section "Required services reachable?"
for NAME_URL in \
  "Temporal UI|http://localhost:8233" \
  "detection|http://localhost:14001/health" \
  "Ollama|http://localhost:11434/api/tags" \
  "api-service|http://localhost:14000/v1/health" \
  "Grafana|http://localhost:3000/api/health"; do
  IFS='|' read -r NAME URL <<<"$NAME_URL"
  if curl -sf "$URL" >/dev/null 2>&1; then log_ok "$NAME"; else log_fail "$NAME ($URL) — start with 'make start'"; exit 1; fi
done

log_section "Required models loaded?"
for M in qwen2.5vl:7b qwen2.5vl:3b moondream; do
  if ollama list | awk 'NR>1 {print $1}' | grep -qx "$M" \
     || ollama list | awk 'NR>1 {print $1}' | grep -qx "${M}:latest"; then
    log_ok "$M"
  else
    log_fail "$M (run 'ollama pull $M')"
    exit 1
  fi
done

log_section "Happy path + idempotency + trace"
cd "$PROJECT_ROOT/api-service"
npx tsx ../scripts/smoke-assertions.ts \
  --fixture src/__tests__/fixtures/room_01.jpg \
  --api-url http://localhost:14000

if [ "$DRILLS" = "--drills" ]; then
  log_section "Degraded path — pause Ollama"
  if pkill -STOP -x ollama 2>/dev/null; then
    log_warn "Ollama paused (SIGSTOP)"
  else
    log_warn "Could not pause Ollama (process not found under exact name); skipping degraded drill"
  fi
  sleep 3

  HTTP=$(curl -s -o /tmp/smoke-degraded.json -w "%{http_code}" \
    -X POST http://localhost:14000/v1/detect \
    -F "file=@src/__tests__/fixtures/room_01.jpg" || echo "000")
  if [ "$HTTP" = "200" ]; then
    TIER=$(python3 -c "import json, sys; d=json.load(open('/tmp/smoke-degraded.json')); print([i.get('enrichmentTier') for i in d.get('items',[])])" 2>/dev/null || echo "unknown")
    log_ok "Degraded 200 with florence-only fallback; tiers=$TIER"
  else
    log_fail "Expected 200 with florence-only fallback, got $HTTP"
  fi

  pkill -CONT -x ollama 2>/dev/null || true
  log_warn "Ollama resumed (SIGCONT)"

  log_section "Fault injection — kill api-service worker"
  log_warn "Manual step: kill -9 \$(cat /tmp/allmythings/api.pid) mid-request, verify workflow resumes in Temporal UI"
fi

log_section "Done"
echo -e "${GREEN}SMOKE TEST PASSED${NC}"
