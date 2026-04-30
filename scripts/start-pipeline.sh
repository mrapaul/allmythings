#!/usr/bin/env bash
# Bring up the pipeline-service sidecar after sanity-checking its upstream
# dependencies (Florence detection-service + Ollama).
#
# This script is invoked by `make start` (wired in section-10) but is
# usable standalone: `./scripts/start-pipeline.sh`.
#
# Behaviour:
#   1. Health-check Florence and Ollama before starting the sidecar.
#   2. Ensure DAGSTER_HOME exists.
#   3. Launch uvicorn on 127.0.0.1:${PIPELINE_PORT:-14100}.
#   4. Block until the sidecar reports `ready=true` on /health.

set -euo pipefail

PIPELINE_PORT="${PIPELINE_PORT:-14100}"
PIPELINE_BIND_HOST="${PIPELINE_BIND_HOST:-127.0.0.1}"
FLORENCE_HEALTH_URL="${FLORENCE_HEALTH_URL:-http://127.0.0.1:14001/health}"
OLLAMA_HEALTH_URL="${OLLAMA_HEALTH_URL:-http://127.0.0.1:11434/api/tags}"
DAGSTER_HOME_DIR="${DAGSTER_HOME:-${HOME}/allmythings-data/dagster}"
PIPELINE_DIR="${PIPELINE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/pipeline-service}"

log() { printf '[start-pipeline] %s\n' "$*" >&2; }

health_check() {
  local label="$1"
  local url="$2"
  if ! curl -fs --max-time 5 "$url" > /dev/null; then
    log "FATAL: ${label} health-check failed: ${url}"
    exit 1
  fi
  log "${label} OK"
}

log "checking upstream services"
health_check "Florence" "$FLORENCE_HEALTH_URL"
health_check "Ollama"   "$OLLAMA_HEALTH_URL"

mkdir -p "$DAGSTER_HOME_DIR"
export DAGSTER_HOME="$DAGSTER_HOME_DIR"

log "launching pipeline-service sidecar on ${PIPELINE_BIND_HOST}:${PIPELINE_PORT}"
cd "$PIPELINE_DIR"
uv run uvicorn pipeline_service.api.server:app \
  --host "$PIPELINE_BIND_HOST" \
  --port "$PIPELINE_PORT" \
  &
SIDECAR_PID=$!

# Wait for /health -> ready=true (cap 60 s)
log "waiting for /health ready (pid ${SIDECAR_PID})"
for _ in $(seq 1 60); do
  if curl -fs --max-time 2 "http://${PIPELINE_BIND_HOST}:${PIPELINE_PORT}/health" \
        | grep -q '"ready":[[:space:]]*true'; then
    log "sidecar ready"
    wait "$SIDECAR_PID"
    exit $?
  fi
  sleep 1
done

log "FATAL: sidecar did not become ready within 60s"
kill -TERM "$SIDECAR_PID" 2>/dev/null || true
wait "$SIDECAR_PID" 2>/dev/null || true
exit 1
