#!/usr/bin/env bash
# Deploy the Home Inventory inference stack to Azure (credits-funded).
# Idempotent: safe to re-run; existing resources are reused.
#
# Prerequisites BEFORE running:
#   1. GPU quota approved: portal.azure.com → Usage + quotas → uksouth →
#      "Standard NCADS_A100_v4 Family" → New limit 24. (Script verifies and
#      aborts with instructions if still 0.)
#   2. Tailscale auth key (optional but recommended): https://login.tailscale.com/admin/settings/keys
#      → generate a reusable key, then: TS_AUTHKEY=tskey-... ./deploy.sh
#      Without it, the script prints the `sudo tailscale up` step at the end.
#
# Usage: ./deploy.sh           (from infra/azure/)
set -euo pipefail

RG="allmythings-prod"
LOC="uksouth"
VM="hi-gpu-01"
SIZE="Standard_NC24ads_A100_v4"
SSH_KEY="${HOME}/.ssh/id_ed25519.pub"
TS_AUTHKEY="${TS_AUTHKEY:-TS_AUTHKEY_PLACEHOLDER}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [ ! -f "$SSH_KEY" ]; then
  ssh-keygen -t ed25519 -N "" -f "${SSH_KEY%.pub}" -C "allmythings-azure"
fi

echo "== checking quota for $SIZE in $LOC =="
FAMILY="Standard NCADS_A100_v4 Family"
LIMIT=$(az vm list-usage -l "$LOC" --query "[?name.localizedName=='$FAMILY'].limit" -o tsv)
if [ "${LIMIT:-0}" -lt 24 ]; then
  cat >&2 <<'EOF'
GPU quota is still 0. Request it first (takes minutes-to-hours to approve):
  portal.azure.com → search "Usage + quotas" → uksouth →
  Compute → "Standard NCADS_A100_v4 Family" → "Request quota increase" →
  New limit: 24 → Submit. Then re-run this script.
EOF
  exit 1
fi

echo "== resource group =="
az group create -n "$RG" -l "$LOC" -o none

if az vm show -g "$RG" -n "$VM" >/dev/null 2>&1; then
  echo "== VM $VM already exists, skipping creation =="
else
  CLOUD_INIT="$(mktemp)"
  sed "s|{{TS_AUTHKEY}}|$TS_AUTHKEY|g" "$(dirname "$0")/cloud-init.yaml" > "$CLOUD_INIT"
  echo "== VM (spot=false; eviction would stall detections) =="
  az vm create -g "$RG" -n "$VM" \
    --image Ubuntu2404 \
    --size "$SIZE" \
    --admin-username azureuser \
    --ssh-key-values "$SSH_KEY" \
    --public-ip-sku Standard \
    --nsg-rule SSH \
    --accelerated-networking true \
    --custom-data "$CLOUD_INIT" \
    -o none
  rm -f "$CLOUD_INIT"
  echo "== waiting for cloud-init (docker + GPU toolkit + tailscale) =="
  sleep 60
fi

IP=$(az vm show -g "$RG" -n "$VM" -d --query publicIps -o tsv)
echo "VM public IP: $IP"

echo "== waiting for SSH =="
for i in $(seq 1 60); do
  ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 azureuser@"$IP" true 2>/dev/null && break
  sleep 10
done

echo "== shipping source to VM (x86 build happens there) =="
ssh azureuser@"$IP" "mkdir -p /opt/allmythings/infra"
rsync -az --delete -e "ssh -o StrictHostKeyChecking=accept-new" \
  "$REPO_ROOT/api-service" azureuser@"$IP":/opt/allmythings/
rsync -az -e "ssh -o StrictHostKeyChecking=accept-new" \
  "$REPO_ROOT/infra/azure/docker-compose.yml" azureuser@"$IP":/opt/allmythings/infra/

echo "== building and starting stack =="
ssh azureuser@"$IP" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/allmythings/infra
sudo docker compose build api
sudo docker compose up -d
echo "== pulling qwen3-vl:30b-a3b-instruct (~19GB) =="
sudo docker exec ollama ollama pull qwen3-vl:30b-a3b-instruct
sudo docker compose ps
REMOTE

echo
echo "== DONE =="
if [ "$TS_AUTHKEY" = "TS_AUTHKEY_PLACEHOLDER" ]; then
  echo "Next: ssh azureuser@$IP && sudo tailscale up   (then: tailscale ip -4)"
else
  TS_IP=$(ssh azureuser@"$IP" "tailscale ip -4 2>/dev/null || echo pending")
  echo "Tailscale IP: $TS_IP"
  echo "On the phone: Settings → Server URL → http://$TS_IP:14000"
fi
echo "Health: ssh azureuser@$IP curl -s http://localhost:14000/v1/health"
