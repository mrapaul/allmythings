#!/bin/bash
# allmythings — unified service manager.
# Usage: ./scripts/start-all.sh {start|stop|status|logs}
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info() { echo -e "${BLUE}[INFO]${NC}    $1"; }
log_ok()   { echo -e "${GREEN}[ OK ]${NC}   $1"; }
log_err()  { echo -e "${RED}[ERROR]${NC}  $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC}   $1"; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="/tmp/allmythings"
mkdir -p "$RUN_DIR"
API_PID="$RUN_DIR/api.pid"
API_LOG="$RUN_DIR/api.log"

COMPOSE="$PROJECT_ROOT/observability/docker-compose.lgtm.yml"
SMOKE_FIXTURE="$PROJECT_ROOT/api-service/src/__tests__/fixtures/smoke_tiny.jpg"

wait_http() { # url timeout label
  local url="$1" timeout="$2" label="$3" elapsed=0
  while [ "$elapsed" -lt "$timeout" ]; do
    if curl -sf "$url" >/dev/null 2>&1; then log_ok "$label is up"; return 0; fi
    sleep 2; elapsed=$((elapsed + 2))
  done
  log_err "$label did not become healthy in ${timeout}s"; return 1
}

cmd_stop() {
  log_info "Stopping all services..."
  for pidfile in "$API_PID"; do
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      kill -TERM "$pid" 2>/dev/null || true
      local waited=0
      while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 5 ]; do sleep 1; waited=$((waited + 1)); done
      kill -KILL "$pid" 2>/dev/null || true
      rm -f "$pidfile"
    fi
  done
  lsof -ti :14000 2>/dev/null | xargs -I{} kill -9 {} 2>/dev/null || true
  lsof -ti :14001 2>/dev/null | xargs -I{} kill -9 {} 2>/dev/null || true
  docker compose -f "$COMPOSE" stop 2>/dev/null || true
  log_ok "All services stopped"
}

cmd_start() {
  # Preflight
  "$PROJECT_ROOT/scripts/preflight.sh"

  # Stop any leftovers cleanly
  cmd_stop

  # ── Stage 1: Observability + Temporal stack ──────────────────────────────
  log_info "Stage 1: Observability + Temporal stack (docker compose up -d)..."
  docker compose -f "$COMPOSE" up -d
  wait_http http://localhost:3000/api/health   30 "Grafana"       || exit 1
  wait_http http://localhost:3100/ready        30 "Loki"          || exit 1
  wait_http http://localhost:3200/ready        30 "Tempo"         || exit 1
  wait_http http://localhost:9191/-/ready      30 "Prometheus"    || exit 1
  wait_http http://localhost:9093/-/ready      30 "Alertmanager"  || exit 1
  wait_http http://localhost:8233              30 "Temporal UI"   || exit 1

  # ── Stage 2: Temporal gRPC ready ─────────────────────────────────────────
  log_info "Stage 2: Temporal gRPC..."
  local elapsed=0
  while [ "$elapsed" -lt 30 ]; do
    if docker exec allmythings-temporal tctl --ns default namespace describe default >/dev/null 2>&1; then
      log_ok "Temporal namespace reachable"
      break
    fi
    sleep 1; elapsed=$((elapsed + 1))
  done
  if [ "$elapsed" -ge 30 ]; then log_err "Temporal gRPC did not become ready"; exit 1; fi

  # ── Stage 3: Ollama + required models ────────────────────────────────────
  log_info "Stage 3: Ollama + required models..."
  if ! pgrep -x ollama >/dev/null; then
    # Force localhost bind: the login shell may export a stale remote OLLAMA_HOST.
    OLLAMA_HOST=127.0.0.1:11434 ollama serve >>"$RUN_DIR/ollama.log" 2>&1 &
    local ollama_elapsed=0
    while [ "$ollama_elapsed" -lt 30 ]; do
      if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then break; fi
      sleep 1; ollama_elapsed=$((ollama_elapsed + 1))
    done
  fi
  wait_http http://localhost:11434/api/tags 10 "Ollama" || exit 1

  # Active detector model from api-service/.env (fallback: shipped default).
  ACTIVE_MODEL="$(grep -E '^OLLAMA_MODEL=' "$PROJECT_ROOT/api-service/.env" 2>/dev/null | cut -d= -f2 || true)"
  ACTIVE_MODEL="${ACTIVE_MODEL:-gemma4:31b-cloud}"
  for MODEL in "$ACTIVE_MODEL"; do
    MODEL_SHORT="${MODEL%:latest}"
    if ! OLLAMA_HOST=127.0.0.1:11434 ollama list | awk 'NR>1 {print $1}' | grep -qx "$MODEL_SHORT" \
         && ! OLLAMA_HOST=127.0.0.1:11434 ollama list | awk 'NR>1 {print $1}' | grep -qx "$MODEL"; then
      log_info "Pulling $MODEL..."
      OLLAMA_HOST=127.0.0.1:11434 ollama pull "$MODEL"
    fi
    log_ok "model: $MODEL"
  done

  BIG_MODEL=$(OLLAMA_HOST=127.0.0.1:11434 ollama ps 2>/dev/null | awk 'NR>1 && $3 ~ /GB/ && $3+0 > 10 {print $1}' | head -1 || true)
  if [ -n "$BIG_MODEL" ]; then
    log_warn "Large model $BIG_MODEL is loaded (>10GB). Consider: ollama stop $BIG_MODEL"
  fi

  # ── Stage 4: api-service (Fastify + Temporal worker in-process) ─────────
  log_info "Stage 4: api-service (Fastify :14000 + Temporal worker)..."
  (
    cd "$PROJECT_ROOT/api-service"
    if [ -f .env ]; then
      node --env-file=.env ./node_modules/.bin/tsx src/app.ts
    else
      node ./node_modules/.bin/tsx src/app.ts
    fi
  ) >>"$API_LOG" 2>&1 &
  echo $! > "$API_PID"
  log_info "api-service PID=$(cat "$API_PID") — logs: $API_LOG"
  wait_http http://localhost:14000/v1/health 30 "api-service" || exit 1

  # ── Stage 6: Warm-up ─────────────────────────────────────────────────────
  if [ -f "$SMOKE_FIXTURE" ]; then
    log_info "Stage 5: Warm-up (one fixture request through the pipeline)..."
    curl -s -X POST http://localhost:14000/v1/detect -F "file=@$SMOKE_FIXTURE" -o /dev/null --max-time 90 || log_warn "Warm-up request did not complete (may be cold-start)"
    log_ok "Warm-up complete"
  else
    log_warn "Warm-up fixture not found at $SMOKE_FIXTURE — skipping"
  fi

  echo
  log_ok "All services ready."
  echo
  echo "  Temporal  http://localhost:8233"
  echo "  Grafana   http://localhost:3000  (admin/admin)"
  echo "  API       http://localhost:14000"
  echo
  echo "  iPhone connects via mDNS: allmythings._http._tcp.local"
  echo
  echo "  Run 'make smoke' to verify the pipeline."
  cmd_status
}

cmd_status() {
  echo -e "${BLUE}── Service Status ─────────────────${NC}"
  for SVC in \
    "Grafana|http://localhost:3000/api/health" \
    "Tempo|http://localhost:3200/ready" \
    "Loki|http://localhost:3100/ready" \
    "Prometheus|http://localhost:9191/-/ready" \
    "Alertmanager|http://localhost:9093/-/ready" \
    "Temporal UI|http://localhost:8233" \
    "Ollama|http://localhost:11434/api/tags" \
    "API|http://localhost:14000/v1/health"; do
    IFS='|' read -r NAME URL <<< "$SVC"
    if curl -sf "$URL" >/dev/null 2>&1; then
      printf "  ${GREEN}●${NC} %-15s UP\n" "$NAME"
    else
      printf "  ${RED}●${NC} %-15s DOWN\n" "$NAME"
    fi
  done
}

cmd_logs() {
  mkdir -p "$RUN_DIR"
  touch "$API_LOG"
  log_info "Tailing combined logs (Ctrl-C to exit)..."
  tail -f "$API_LOG"
}

case "${1:-help}" in
  start)  cmd_start  ;;
  stop)   cmd_stop   ;;
  status) cmd_status ;;
  logs)   cmd_logs   ;;
  *) echo "Usage: $0 {start|stop|status|logs}"; exit 1 ;;
esac
