#!/usr/bin/env bash
# Move the local observability + Temporal stack (observability/docker-compose.lgtm.yml)
# off the Mac and onto the private nixos box (Tailscale, 24 cores / 62 GB).
# Tailnet-only: every UI and OTLP port binds to the box's Tailscale IP, so the
# stack is reachable from your devices and nothing else.
#
# Idempotent: safe to re-run; re-syncs configs and recreates changed containers.
# Usage: ./deploy.sh        (from infra/nixos/observability/)
set -euo pipefail

SSH_HOST="${SSH_HOST:-nixos-opbot}"
REMOTE_DIR='$HOME/allmythings-observability'
# Tailscale IPs (pinned; both boxes keep theirs)
NIXOS_TS_IP="100.118.15.81"     # nixos — hosts the stack
MAC_TS_IP="100.99.186.121"      # clouddominion (this Mac) — API scrape target
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
say() { echo -e "${BLUE}► $1${NC}"; }
ok()  { echo -e "  ${GREEN}✓${NC} $1"; }

say "checking nixos docker"
ssh -o BatchMode=yes "$SSH_HOST" 'docker info --format "{{.ServerVersion}}" >/dev/null' \
  || { echo "docker not reachable on $SSH_HOST" >&2; exit 1; }
ok "docker up on $SSH_HOST"

say "syncing stack source"
ssh "$SSH_HOST" "mkdir -p $REMOTE_DIR"
rsync -az --delete \
  --exclude 'docker-compose.observability.yml' \
  --exclude '.env' \
  "$REPO_ROOT/observability/" "$SSH_HOST:$REMOTE_DIR/"
ok "synced to $SSH_HOST:$REMOTE_DIR"

say "generating grafana admin password"
GRAFANA_PW="$(openssl rand -hex 12)"
mkdir -p "$HOME/.config/allmythings"
umask 077; printf 'nixos-grafana %s:%s\n' admin "$GRAFANA_PW" > "$HOME/.config/allmythings/grafana-admin.txt"
ok "saved to ~/.config/allmythings/grafana-admin.txt (0600)"

say "patching for the nixos host (one-way, on the remote copy only)"
ssh "$SSH_HOST" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"
# Mac host paths -> nixos host paths for promtail binds
mkdir -p "\$HOME/allmythings-host-data" /tmp/allmythings
sed -i 's|\${HOME}/allmythings-data:/host-data:ro|\$HOME/allmythings-host-data:/host-data:ro|' docker-compose.lgtm.yml
# scrape targets: Mac API via its tailscale IP (host.docker.internal is Docker-Desktop-only)
sed -i 's/host.docker.internal/$MAC_TS_IP/g' prometheus/prometheus.yml
# grafana password
sed -i 's|- GF_SECURITY_ADMIN_PASSWORD=admin|- GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_ADMIN_PASSWORD:-admin}|' docker-compose.lgtm.yml
# bind every UI + OTLP port to the tailscale interface only; loki's host
# port is remapped 3100->13100 (3100 already serves another tenant there)
sed -i 's/"3100:3100"/"'$NIXOS_TS_IP':13100:3100"/' docker-compose.lgtm.yml
sed -i -E 's/"((4317|4318|3000|3200|8233|9093|9191)):/"'$NIXOS_TS_IP':\1:/g' docker-compose.lgtm.yml
# 8888 (collector self-metrics) is taken host-wide; prometheus scrapes it via
# the compose network, so drop the host publish entirely
sed -i '/8888/d' docker-compose.lgtm.yml
GRAFANA_ADMIN_PASSWORD="$GRAFANA_PW" docker compose -f docker-compose.lgtm.yml up -d
# loki's named volume must be writable by uid 10001 — on native docker a
# root-owned volume crash-loops the ruler (Docker Desktop masked this)
docker run --rm -v allmythings-observability_loki-data:/tmp/loki \
  grafana/loki:3.1.1 sh -c 'mkdir -p /tmp/loki/rules /tmp/loki/chunks && chown -R 10001:10001 /tmp/loki' >/dev/null 2>&1 || true
docker restart allmythings-loki >/dev/null 2>&1 || true
REMOTE
ok "stack up"

say "health"
sleep 8
ssh "$SSH_HOST" "docker compose -f $REMOTE_DIR/docker-compose.lgtm.yml ps --format '{{.Name}}\t{{.Status}}' | head -12"
curl -s -o /dev/null -w "grafana http=%{http_code}\n" "http://$NIXOS_TS_IP:3000/api/health" || true

cat <<EOF

Stack is on $SSH_HOST ($NIXOS_TS_IP), tailnet-only:
  Grafana      http://$NIXOS_TS_IP:3000   (admin / $GRAFANA_PW, also in ~/.config/allmythings/grafana-admin.txt)
  Temporal UI  http://$NIXOS_TS_IP:8233
  Prometheus   http://$NIXOS_TS_IP:9191

Mac cutover (so the API's traces/logs follow):
  1. add to api-service/.env:   OTEL_EXPORTER_OTLP_ENDPOINT=http://$NIXOS_TS_IP:4317
  2. launchctl kickstart -k gui/\$(id -u)/com.allmythings.api
  3. retire the Mac copy:  docker compose -f observability/docker-compose.lgtm.yml down
EOF
