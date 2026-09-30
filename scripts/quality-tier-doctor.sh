#!/bin/bash
# Quality-tier doctor: verifies the env-configured 'quality' VLM endpoint
# (QUALITY_VLM_URL/KEY/MODEL in api-service/.env) end-to-end through the live
# API — endpoint probe, one async ?tier=quality detect on the living-room
# fixture, and a PASS/FAIL verdict with latency + item count.
#
# A correct FAIL is as useful as a PASS: with the NVIDIA NIM free tier the
# endpoint probe times out and this script tells you exactly which hop died.
# Usage: ./scripts/quality-tier-doctor.sh
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; BLUE='\033[0;34m'; YELLOW='\033[0;33m'; NC='\033[0m'
log_section() { echo -e "\n${BLUE}► $1${NC}"; }
log_ok()      { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn()    { echo -e "  ${YELLOW}!${NC} $1"; }
log_fail()    { echo -e "  ${RED}✗${NC} $1"; exit 1; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${API_URL:-http://127.0.0.1:14000}"
FIXTURE="$PROJECT_ROOT/test_images/living_room/living_room_01.jpg"
ENV_FILE="$PROJECT_ROOT/api-service/.env"
# Quality runs hit the remote engine; allow generous override (seconds).
RUN_TIMEOUT_S="${RUN_TIMEOUT_S:-900}"
PROBE_TIMEOUT_S="${PROBE_TIMEOUT_S:-45}"

# --- read quality-tier config from api-service/.env (no dotenv dep) ----------
env_val() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true; }
QUALITY_VLM_URL="$(env_val QUALITY_VLM_URL)"
QUALITY_VLM_MODEL="$(env_val QUALITY_VLM_MODEL)"
QUALITY_VLM_API_KEY="$(env_val QUALITY_VLM_API_KEY)"

log_section "Quality-tier configuration (api-service/.env)"
[ -n "$QUALITY_VLM_URL" ]   || log_fail "QUALITY_VLM_URL is empty — set it in $ENV_FILE (see docs/quality-tier-bringup.md)"
[ -n "$QUALITY_VLM_MODEL" ] || log_fail "QUALITY_VLM_MODEL is empty — set it in $ENV_FILE (see docs/quality-tier-bringup.md)"
log_ok "QUALITY_VLM_URL=$QUALITY_VLM_URL"
log_ok "QUALITY_VLM_MODEL=$QUALITY_VLM_MODEL"
[ -n "$QUALITY_VLM_API_KEY" ] || log_warn "QUALITY_VLM_API_KEY empty — endpoint assumed unauthenticated (local/Tailscale)"

log_section "API reachable?"
curl -sf "$API_URL/v1/health" >/dev/null 2>&1 && log_ok "api-service ($API_URL)" \
  || log_fail "api-service ($API_URL) — start with 'launchctl kickstart -k gui/\$(id -u)/com.allmythings.api'"

# --- endpoint probe: OpenAI-compatible /models ------------------------------
# NIM, OpenRouter, Ollama's OpenAI shim, SGLang's /v1, vLLM all expose it.
BASE="${QUALITY_VLM_URL%/}"
# bash 3.2 (macOS /bin/bash) chokes on "${arr[@]}" of an empty array under
# set -u, so build the curl command as a string instead.
AUTH_OPT=""
[ -n "$QUALITY_VLM_API_KEY" ] && AUTH_OPT="Authorization: Bearer $QUALITY_VLM_API_KEY"

MODELS_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -m "$PROBE_TIMEOUT_S" \
  ${AUTH_OPT:+-H "$AUTH_OPT"} "$BASE/models" 2>/dev/null || echo "000")
if [ "$MODELS_HTTP" = "200" ]; then
  if curl -s -m "$PROBE_TIMEOUT_S" ${AUTH_OPT:+-H "$AUTH_OPT"} "$BASE/models" | grep -q "$QUALITY_VLM_MODEL"; then
    log_ok "endpoint reachable, model listed in /models"
  else
    log_warn "endpoint reachable but '$QUALITY_VLM_MODEL' not in /models — auth may be scoped or the model alias differs; continuing"
  fi
else
  log_fail "endpoint probe failed: GET $BASE/models → HTTP $MODELS_HTTP (timeout ${PROBE_TIMEOUT_S}s). The quality tier is not servable from this machine."
fi

# --- one real quality-tier detection through the live API --------------------
[ -f "$FIXTURE" ] || log_fail "Fixture missing: $FIXTURE"
log_section "Live run: POST /v1/detect?tier=quality&async=1"
RESP=$(curl -s -m 60 -X POST "$API_URL/v1/detect?tier=quality&async=1" \
  -F "photo=@$FIXTURE;type=image/jpeg")
RUN_ID=$(echo "$RESP" | sed -n 's/.*"runId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -n "$RUN_ID" ] || log_fail "no runId in response: $(echo "$RESP" | head -c 200)"
log_ok "runId=$RUN_ID"

START_TS=$(date +%s)
STATUS=""
while :; do
  NOW_TS=$(date +%s)
  ELAPSED=$((NOW_TS - START_TS))
  if [ "$ELAPSED" -gt "$RUN_TIMEOUT_S" ]; then
    log_fail "run not completed after ${RUN_TIMEOUT_S}s (status=$STATUS) — see $API_URL/v1/detect/status/$RUN_ID"
  fi
  BODY=$(curl -s -m 30 "$API_URL/v1/detect/status/$RUN_ID")
  STATUS=$(echo "$BODY" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  if [ "$STATUS" = "failed" ]; then
    ERR=$(echo "$BODY" | tr -d '\n' | head -c 300)
    log_fail "run failed after ${ELAPSED}s: $ERR"
  fi
  [ "$STATUS" = "completed" ] && break
  sleep 10
done
ELAPSED=$(( $(date +%s) - START_TS ))

ITEMS=$(echo "$BODY" | sed -n 's/.*"result".*"items".*/LISTED/p' | head -1)
ITEM_COUNT=$(echo "$BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d.get("result",{}).get("items",[])))' 2>/dev/null || echo "?")
SCENE=$(echo "$BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("scene",{}).get("verdict","?"))' 2>/dev/null || echo "?")

log_ok "completed in ${ELAPSED}s — $ITEM_COUNT items, scene verdict: $SCENE"
if [ "$ITEM_COUNT" != "?" ] && [ "$ITEM_COUNT" -ge 1 ]; then
  log_section "Verdict"
  echo -e "  ${GREEN}QUALITY TIER PASS${NC} ($QUALITY_VLM_MODEL, ${ELAPSED}s/photo)"
else
  log_fail "run completed but returned no items — engine reachable but detection broken"
fi
