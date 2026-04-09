#!/usr/bin/env bash
set -euo pipefail
docker compose -f docker-compose.dev.yml up -d mlflow label-studio prefect
sleep 20
curl -fsS http://localhost:5000/health              # MLflow
curl -fsS http://localhost:8080/health              # Label Studio
curl -fsS http://localhost:4200/api/health          # Prefect
echo "MLOPS_OK"
