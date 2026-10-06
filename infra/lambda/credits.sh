#!/usr/bin/env bash
# Check Lambda Cloud state for the quality-tier deployment: what's running and
# what it costs per hour. Note: Lambda exposes NO credit-balance endpoint —
# the $7500 credit status is dashboard-only (cloud.lambda.ai → Billing).
# Usage: LAMBDA_API_KEY=lak_... ./credits.sh
set -euo pipefail

API="https://cloud.lambda.ai/api/v1"
LAMBDA_API_KEY="${LAMBDA_API_KEY:-}"
[ -n "$LAMBDA_API_KEY" ] || {
  cat >&2 <<'EOF'
LAMBDA_API_KEY is not set. Create one at https://cloud.lambda.ai → API Keys,
then:  LAMBDA_API_KEY=lak_... ./credits.sh
EOF
  exit 1
}

echo "== running instances =="
curl -sf -m 30 -H "Authorization: Bearer $LAMBDA_API_KEY" "$API/instances" \
  | jq -r '.data[]? | "\(.id)\t\(.instance_type.name)\t\(.status)\t\(.ip)\t$\(.instance_type.price_cents_per_hour / 100)/h"' \
  | column -t -s $'\t' || echo "(none)"

echo "== credit balance =="
echo "dashboard-only: cloud.lambda.ai → Billing (no API endpoint exists)"
