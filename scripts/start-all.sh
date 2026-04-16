#!/bin/bash
# allmythings — unified process manager
# Usage: ./scripts/start-all.sh {start|stop|status|logs}

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Paths ─────────────────────────────────────────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="/tmp/allmythings"
DETECTION_PID_FILE="$RUN_DIR/detection.pid"
API_PID_FILE="$RUN_DIR/api.pid"
OLLAMA_PID_FILE="$RUN_DIR/ollama.pid"
DETECTION_LOG="$RUN_DIR/detection.log"
API_LOG="$RUN_DIR/api.log"
OLLAMA_LOG="$RUN_DIR/ollama.log"

# ── Logging helpers ───────────────────────────────────────────────────────────
log_info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
log_success() { echo -e "${GREEN}[OK]${NC}      $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC}   $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}    $1"; }

# ── Health-check helper ───────────────────────────────────────────────────────
# wait_healthy <url> <timeout_seconds> <label>
wait_healthy() {
  local url="$1"
  local timeout="$2"
  local label="$3"
  local elapsed=0
  log_info "Waiting for $label to be healthy ($url, timeout ${timeout}s)..."
  while [ "$elapsed" -lt "$timeout" ]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      log_success "$label is up."
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  log_error "$label did not become healthy within ${timeout}s."
  return 1
}

# ── stop ─────────────────────────────────────────────────────────────────────
cmd_stop() {
  log_info "Stopping all services..."

  for pidfile in "$DETECTION_PID_FILE" "$API_PID_FILE" "$OLLAMA_PID_FILE"; do
    if [ -f "$pidfile" ]; then
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        log_info "Sending SIGTERM to PID $pid..."
        kill -TERM "$pid" 2>/dev/null || true
        # Wait up to 5s then SIGKILL
        local waited=0
        while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 5 ]; do
          sleep 1
          waited=$((waited + 1))
        done
        if kill -0 "$pid" 2>/dev/null; then
          log_warn "PID $pid still alive — sending SIGKILL."
          kill -KILL "$pid" 2>/dev/null || true
        fi
      fi
      rm -f "$pidfile"
    fi
  done

  # Fallback: kill by port
  log_info "Killing any remaining processes on ports 14000 and 14001..."
  lsof -ti :14000 | xargs kill -9 2>/dev/null || true
  lsof -ti :14001 | xargs kill -9 2>/dev/null || true

  log_success "All services stopped."
}

# ── start ─────────────────────────────────────────────────────────────────────
cmd_start() {
  mkdir -p "$RUN_DIR"

  # Stop any existing instances first
  cmd_stop

  # ── 1. detection-service ──────────────────────────────────────────────────
  log_info "Starting detection-service (FastAPI :14001)..."
  (
    cd "$PROJECT_ROOT/detection-service"
    ./venv/bin/python -m uvicorn detection_service.main:app \
      --host 0.0.0.0 --port 14001
  ) >> "$DETECTION_LOG" 2>&1 &
  DETECTION_PID=$!
  echo "$DETECTION_PID" > "$DETECTION_PID_FILE"
  log_info "detection-service PID=$DETECTION_PID — logs: $DETECTION_LOG"

  if ! wait_healthy "http://localhost:14001/" 120 "detection-service"; then
    log_error "detection-service failed to start. Last 30 lines of log:"
    tail -n 30 "$DETECTION_LOG" || true
    exit 1
  fi

  # ── 2. Ollama ─────────────────────────────────────────────────────────────
  if pgrep -x ollama > /dev/null 2>&1; then
    log_info "Ollama is already running — skipping launch."
  else
    log_info "Starting Ollama..."
    ollama serve >> "$OLLAMA_LOG" 2>&1 &
    OLLAMA_PID=$!
    echo "$OLLAMA_PID" > "$OLLAMA_PID_FILE"
    log_info "Ollama PID=$OLLAMA_PID — logs: $OLLAMA_LOG"
    if ! wait_healthy "http://localhost:11434/api/tags" 30 "Ollama"; then
      log_error "Ollama failed to start. Last 20 lines of log:"
      tail -n 20 "$OLLAMA_LOG" || true
      exit 1
    fi
  fi

  # Pull model if not present
  if ! ollama list 2>/dev/null | grep -q "qwen2.5vl:7b"; then
    log_info "Pulling qwen2.5vl:7b model (this may take a while)..."
    ollama pull qwen2.5vl:7b
    log_success "Model pull complete."
  else
    log_info "qwen2.5vl:7b already present — skipping pull."
  fi

  # ── 3. api-service ────────────────────────────────────────────────────────
  log_info "Starting api-service (Fastify :14000)..."
  (
    cd "$PROJECT_ROOT/api-service"
    node --env-file=.env ./node_modules/.bin/tsx src/app.ts
  ) >> "$API_LOG" 2>&1 &
  API_PID=$!
  echo "$API_PID" > "$API_PID_FILE"
  log_info "api-service PID=$API_PID — logs: $API_LOG"

  if ! wait_healthy "http://localhost:14000/v1/health" 30 "api-service"; then
    log_error "api-service failed to start. Last 30 lines of log:"
    tail -n 30 "$API_LOG" || true
    exit 1
  fi

  echo ""
  log_success "All services ready. Open the app on your iPhone."
  echo ""
  cmd_status
}

# ── status ────────────────────────────────────────────────────────────────────
cmd_status() {
  echo -e "${BLUE}── Service Status ──────────────────────────────────────${NC}"

  # detection-service
  if curl -sf "http://localhost:14001/" > /dev/null 2>&1; then
    echo -e "  ${GREEN}●${NC} detection-service  :14001  UP"
  else
    echo -e "  ${RED}●${NC} detection-service  :14001  DOWN"
  fi

  # Ollama
  if curl -sf "http://localhost:11434/api/tags" > /dev/null 2>&1; then
    echo -e "  ${GREEN}●${NC} ollama             :11434  UP"
  else
    echo -e "  ${RED}●${NC} ollama             :11434  DOWN"
  fi

  # api-service
  if curl -sf "http://localhost:14000/v1/health" > /dev/null 2>&1; then
    echo -e "  ${GREEN}●${NC} api-service        :14000  UP"
  else
    echo -e "  ${RED}●${NC} api-service        :14000  DOWN"
  fi

  echo -e "${BLUE}────────────────────────────────────────────────────────${NC}"
}

# ── logs ──────────────────────────────────────────────────────────────────────
cmd_logs() {
  mkdir -p "$RUN_DIR"
  touch "$DETECTION_LOG" "$API_LOG" "$OLLAMA_LOG"
  log_info "Tailing combined logs (Ctrl-C to exit)..."
  tail -f "$DETECTION_LOG" "$API_LOG" "$OLLAMA_LOG"
}

# ── dispatch ──────────────────────────────────────────────────────────────────
COMMAND="${1:-help}"

case "$COMMAND" in
  start)  cmd_start  ;;
  stop)   cmd_stop   ;;
  status) cmd_status ;;
  logs)   cmd_logs   ;;
  *)
    echo "Usage: $0 {start|stop|status|logs}"
    exit 1
    ;;
esac
