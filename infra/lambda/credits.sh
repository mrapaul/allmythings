#!/usr/bin/env bash
# Check the Lambda Cloud credit balance + running instances for the
# quality-tier deployment. Uses the public REST API — no CLI install needed.
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

echo "== credit balance =="
curl -sf -m 30 -H "Authorization: Bearer $LAMBDA_API_KEY" "$API/credit-balance" \
  | jq -r 'to_entries | map("\(.key): \(.value)") | .[]' || echo "(balance endpoint unreachable — key valid? credits applied yet?)"

echo "== running instances =="
curl -sf -m 30 -H "Authorization: Bearer $LAMBDA_API_KEY" "$API/instances" \
  | jq -r '.data[]? | "\(.id)\t\(.instance_type.name)\t\(.status)\t\(.ip)"' \
  | column -t -s $'\t' || echo "(none)"
