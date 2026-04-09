#!/usr/bin/env bash
set -euo pipefail
docker compose -f docker-compose.dev.yml up -d prometheus tempo loki grafana
sleep 10
curl -fsS http://localhost:9090/-/healthy          # Prometheus
curl -fsS http://localhost:3200/ready              # Tempo
curl -fsS http://localhost:3100/ready              # Loki
curl -fsS http://localhost:3000/api/health         # Grafana
echo "OBSERVABILITY_OK"
