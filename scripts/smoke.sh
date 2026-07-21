#!/bin/bash
# End-to-end smoke test for the current stack: Ollama-backed VLM detector
# behind api-service. Exercises /v1/health, /v1/detect/stream (meta → scene →
# items → done), /v1/label, and /v1/corrections validation.
# Usage: ./scripts/smoke.sh
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log_section() { echo -e "\n${BLUE}► $1${NC}"; }
log_ok()      { echo -e "  ${GREEN}✓${NC} $1"; }
log_fail()    { echo -e "  ${RED}✗${NC} $1"; exit 1; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${API_URL:-http://localhost:14000}"
FIXTURE="$PROJECT_ROOT/api-service/src/__tests__/fixtures/room_01.jpg"
# Active Ollama model from api-service/.env (fallback to the shipped default).
OLLAMA_MODEL="$(grep -E '^OLLAMA_MODEL=' "$PROJECT_ROOT/api-service/.env" 2>/dev/null | cut -d= -f2 || true)"
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:31b-cloud}"
STREAM_TIMEOUT_S="${STREAM_TIMEOUT_S:-900}"

log_section "Required services reachable?"
curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1 && log_ok "Ollama" \
  || log_fail "Ollama (http://localhost:11434) — start with 'make start-deps'"
curl -sf "$API_URL/v1/health" >/dev/null 2>&1 && log_ok "api-service" \
  || log_fail "api-service ($API_URL) — start with 'make dev-api'"

log_section "Active model available?"
if curl -s http://localhost:11434/api/tags | grep -q "\"${OLLAMA_MODEL}\""; then
  log_ok "$OLLAMA_MODEL"
else
  log_fail "$OLLAMA_MODEL not in 'ollama list' (run 'ollama pull $OLLAMA_MODEL')"
fi

log_section "Detection stream (meta → scene → items → done)"
[ -f "$FIXTURE" ] || log_fail "Fixture missing: $FIXTURE"
SSE_OUT="$(mktemp)"
curl -s -N -m "$STREAM_TIMEOUT_S" -X POST -H "x-api-key: smoke" \
  -F "frame=@$FIXTURE;type=image/jpeg" \
  "$API_URL/v1/detect/stream" > "$SSE_OUT" || log_fail "stream request failed"
grep -q "^event: meta" "$SSE_OUT" || log_fail "no meta event"
grep -q "photoSha256" "$SSE_OUT" || log_fail "meta missing photoSha256"
log_ok "meta with photoSha256"
grep -q "^event: scene" "$SSE_OUT" || log_fail "no scene event"
log_ok "scene assessment: $(grep -A1 '^event: scene' "$SSE_OUT" | tail -1 | cut -c1-100)"
ITEMS=$(grep -c "^event: item" "$SSE_OUT" || true)
[ "$ITEMS" -ge 1 ] || log_fail "no items detected (see $SSE_OUT)"
log_ok "$ITEMS items streamed"
grep -q "^event: done" "$SSE_OUT" || log_fail "no done event"
log_ok "done event"

log_section "Crop auto-label (/v1/label)"
LABEL=$(curl -s -m 600 -X POST -H "x-api-key: smoke" \
  -F "crop=@$FIXTURE;type=image/jpeg" "$API_URL/v1/label")
echo "$LABEL" | grep -q '"label"' || log_fail "label response invalid: $LABEL"
log_ok "suggested: $(echo "$LABEL" | cut -c1-90)"

log_section "Corrections validation (/v1/corrections)"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -m 20 -X POST \
  -H "content-type: application/json" -H "x-api-key: smoke" \
  -d '{"photoSha256":"nope","events":"bad"}' "$API_URL/v1/corrections")
[ "$HTTP" = "400" ] || log_fail "expected 400 for invalid body, got $HTTP"
log_ok "invalid body rejected with 400 (flywheel untouched)"

log_section "Done"
echo -e "${GREEN}SMOKE TEST PASSED${NC}"
