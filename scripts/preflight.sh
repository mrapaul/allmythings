#!/bin/bash
# Stage 0: preflight checks before `make start` proceeds.
# Exits non-zero if any blocking check fails; exit 0 on pass.
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[ OK ]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

echo -e "${BLUE}── Stage 0: Preflight ──────────────────────${NC}"

# macOS version
if [[ "$(uname)" != "Darwin" ]]; then fail "not macOS"; fi
OS_VER=$(sw_vers -productVersion 2>/dev/null || echo "0.0")
OS_MAJOR=$(echo "$OS_VER" | cut -d. -f1)
if [ "$OS_MAJOR" -lt 14 ]; then fail "macOS $OS_VER is < 14.0"; fi
ok "macOS $OS_VER"

# Docker daemon — only the observability stack needs it. Detection must never
# be hostage to a dashboard: warn and let start-all skip obs instead of dying.
if docker info >/dev/null 2>&1; then
  ok "Docker reachable"
else
  warn "Docker not running — observability (Grafana/Loki) will be skipped; core stack unaffected"
  export SKIP_OBS=1
fi

# Node version
NODE_VER=$(node -v 2>/dev/null || echo "none")
if [[ "$NODE_VER" == "none" ]]; then fail "Node.js not installed"; fi
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then fail "Node $NODE_VER is < 20.0"; fi
ok "Node $NODE_VER"

# Python version
PY_VER=$(python3 --version 2>/dev/null | awk '{print $2}' || echo "none")
if [[ "$PY_VER" == "none" ]]; then fail "python3 not found"; fi
PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 12 ]; }; then
  fail "Python $PY_VER is < 3.12"
fi
ok "Python $PY_VER"

# Ollama CLI
if ! command -v ollama >/dev/null 2>&1; then
  fail "ollama CLI not installed (brew install ollama)"
fi
ok "Ollama CLI present"

# Memory headroom
MEM_BYTES=$(sysctl -n hw.memsize)
MEM_GB=$(( MEM_BYTES / 1024 / 1024 / 1024 ))
# vm_stat reports pages; page size is typically 16384 on Apple Silicon
FREE_PAGES=$(vm_stat | awk '/Pages free/ {gsub("\\.", "", $3); print $3; exit}')
PAGE_SIZE=$(vm_stat | head -1 | awk -F' ' '{for (i=1; i<=NF; i++) if ($i ~ /^[0-9]+$/) { print $i; exit } }')
PAGE_SIZE=${PAGE_SIZE:-16384}
FREE_BYTES=$(( FREE_PAGES * PAGE_SIZE ))
FREE_GB=$(( FREE_BYTES / 1024 / 1024 / 1024 ))
if [ "$FREE_GB" -lt 10 ]; then
  fail "Only ${FREE_GB}GB free of ${MEM_GB}GB — need ≥ 10GB"
fi
if [ "$FREE_GB" -lt 20 ]; then
  warn "Only ${FREE_GB}GB free of ${MEM_GB}GB — prefer ≥ 20GB for comfortable operation"
fi
ok "Memory: ${FREE_GB}GB free of ${MEM_GB}GB"

# Disk headroom
DATA_DIR="${HOME}/allmythings-data"
mkdir -p "$DATA_DIR"
DISK_AVAIL_GB=$(df -g "$DATA_DIR" | tail -1 | awk '{print $4}')
if [ "$DISK_AVAIL_GB" -lt 10 ]; then
  fail "Only ${DISK_AVAIL_GB}GB free in $DATA_DIR — need ≥ 10GB"
fi
ok "Disk: ${DISK_AVAIL_GB}GB free in $DATA_DIR"

# Port availability
for PORT in 14000 14001 7233 8233 3000 3100 3200 9191 9093; do
  if lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    PID=$(lsof -t -i ":$PORT" -sTCP:LISTEN | head -1)
    OWNER=$(ps -p "$PID" -o comm= 2>/dev/null || echo unknown)
    warn "Port $PORT already bound by PID $PID ($OWNER) — 'make start' will attempt to stop first"
  fi
done

echo -e "${GREEN}Preflight PASSED.${NC}"
