#!/usr/bin/env bash
# Stop Lambda Cloud instances (billing halts on termination). With no argument,
# lists running instances; with an id, terminates that one; with --all,
# terminates everything running. Usage: ./destroy.sh [id|--all]
set -euo pipefail

API="https://cloud.lambda.ai/api/v1"
LAMBDA_API_KEY="${LAMBDA_API_KEY:-}"
[ -n "$LAMBDA_API_KEY" ] || { echo "LAMBDA_API_KEY is not set." >&2; exit 1; }

auth() { curl -sf -m 30 -H "Authorization: Bearer $LAMBDA_API_KEY" "$@"; }
auth_json() { curl -sf -m 30 -X POST -H "Authorization: Bearer $LAMBDA_API_KEY" \
  -H "Content-Type: application/json" "$@"; }

IDS=$(auth "$API/instances" | jq -r '.data[]? | select(.status=="active" or .status=="booting") | "\(.id)\t\(.instance_type.name)\t\(.ip)"')
if [ -z "$IDS" ]; then echo "no running instances."; exit 0; fi

case "${1:-}" in
  "") echo "running:"; echo "$IDS" | column -t -s $'\t'; echo; echo "terminate with: ./destroy.sh <id> or ./destroy.sh --all" ;;
  --all) echo "$IDS" | cut -f1 | while read -r id; do echo "terminating $id"; auth_json "$API/instance-operations/terminate" -d "{\"instance_ids\":[\"$id\"]}" >/dev/null; done ;;
  *) echo "terminating $1"; auth_json "$API/instance-operations/terminate" -d "{\"instance_ids\":[\"$1\"]}" >/dev/null ;;
esac
