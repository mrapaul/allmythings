#!/usr/bin/env bash
# Deploy the Home Inventory quality-tier VLM to Lambda Cloud ($7500 Inception
# credits — approved 2026-10-06, activation: portal signup + billing info + email CTA).
# One A100 serves qwen3-vl:30b-a3b-instruct; the API reaches it over Tailscale.
# Idempotent-ish: reuses the registered SSH key, refuses to double-launch if a
# running instance already exists (use infra/lambda/destroy.sh first).
#
# Prerequisites BEFORE running:
#   1. LAMBDA_API_KEY from https://cloud.lambda.ai → API Keys. Either export it
#      or pass inline: LAMBDA_API_KEY=... ./deploy.sh
#   2. Optional: TS_AUTHKEY (https://login.tailscale.com/admin/settings_keys,
#      reusable) so the box joins the tailnet unattended. Without it the script
#      prints the manual `sudo tailscale up` step at the end.
#
# Usage: ./deploy.sh           (from infra/lambda/)
set -euo pipefail

API="https://cloud.lambda.ai/api/v1"
SSH_KEY="${HOME}/.ssh/id_ed25519.pub"
KEY_NAME="allmythings-lambda"
TS_AUTHKEY="${TS_AUTHKEY:-TS_AUTHKEY_PLACEHOLDER}"
# Value picks for 30B-A3B Q4 (~19GB weights); cheapest first.
PREFER=("gpu_1x_a100" "gpu_1x_a100_sxm4" "gpu_1x_a100_pcie" "gpu_1x_h100")

LAMBDA_API_KEY="${LAMBDA_API_KEY:-}"
[ -n "$LAMBDA_API_KEY" ] || {
  cat >&2 <<'EOF'
LAMBDA_API_KEY is not set. Create one at https://cloud.lambda.ai → API Keys,
then:  LAMBDA_API_KEY=lak_... ./deploy.sh
EOF
  exit 1
}

auth() { curl -sf -m 30 -H "Authorization: Bearer $LAMBDA_API_KEY" "$@"; }
auth_json() { curl -sf -m 30 -X POST -H "Authorization: Bearer $LAMBDA_API_KEY" \
  -H "Content-Type: application/json" "$@"; }

echo "== ssh key =="
if [ ! -f "$SSH_KEY" ]; then
  ssh-keygen -t ed25519 -N "" -f "${SSH_KEY%.pub}" -C "allmythings-lambda"
fi
if ! auth "$API/ssh-keys" | jq -e '.data[]? | select(.name=="'"$KEY_NAME"'")' >/dev/null; then
  auth_json "$API/ssh-keys" \
    -d "$(jq -n --arg n "$KEY_NAME" --arg k "$(cat "$SSH_KEY")" '{name:$n, public_key:$k}')" >/dev/null
  echo "registered $KEY_NAME"
else
  echo "$KEY_NAME already registered"
fi

echo "== already running? =="
RUNNING=$(auth "$API/instances" | jq -r '.data[]? | select(.status=="active" or .status=="booting") | .id' || true)
if [ -n "$RUNNING" ]; then
  echo "instance(s) already running: $RUNNING — destroy first (./destroy.sh) or reuse." >&2
  exit 1
fi

echo "== picking cheapest available GPU (30B-A3B needs ~24GB+ VRAM) =="
IT=$(auth "$API/instance-types")
PICK=""
for NAME in "${PREFER[@]}"; do
  REGION=$(echo "$IT" | jq -r --arg n "$NAME" '
    .data[$n].regions_with_capacity_available // empty
    | map(select(.available > 0)) | .[0].name // empty' 2>/dev/null || true)
  [ -n "$REGION" ] && { PICK="$NAME"; break; }
done
[ -n "$PICK" ] || { echo "none of ${PREFER[*]} available right now — retry later." >&2; exit 1; }
PRICE=$(echo "$IT" | jq -r --arg n "$PICK" '.data[$n].instance_type.price_cents_per_hour // "?"')
if [ "$PRICE" != "?" ]; then printf -v PRICE_H '%d.%02d/h' $((10#$PRICE / 100)) $((10#$PRICE % 100)); else PRICE_H="?/h"; fi
echo "launching $PICK in $REGION ($PRICE_H, billed from Lambda credit)"

echo "== launching =="
RESP=$(auth_json "$API/instances" -d "$(jq -n \
  --arg r "$REGION" --arg t "$PICK" --arg k "$KEY_NAME" \
  '{region_name:$r, instance_type_name:$t, ssh_key_names:[$k]}')")
ID=$(echo "$RESP" | jq -r '.data.id')
echo "instance id: $ID"

echo "== waiting for active + ssh =="
IP=""
for i in $(seq 1 90); do
  ST=$(auth "$API/instances/$ID" | jq -r '.data.status')
  [ "$ST" = "active" ] || { sleep 10; continue; }
  IP=$(auth "$API/instances/$ID" | jq -r '.data.ip // empty')
  [ -n "$IP" ] && ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 ubuntu@"$IP" true 2>/dev/null && break
  sleep 10
done
[ -n "$IP" ] || { echo "instance did not become reachable; check https://cloud.lambda.ai" >&2; exit 1; }
echo "public IP: $IP (SSH only; inference rides Tailscale)"

echo "== bootstrap: tailscale + ollama + 30B =="
ssh -o StrictHostKeyChecking=accept-new ubuntu@"$IP" \
  TS_AUTHKEY="$TS_AUTHKEY" bash -s <<'REMOTE'
set -euo pipefail
sudo apt-get update -qq && sudo apt-get install -y -qq ufw jq
curl -fsSL https://tailscale.com/install.sh | sh
curl -fsSL https://ollama.com/install.sh | sh
sudo mkdir -p /etc/systemd/system/ollama.service.d
printf '[Service]\nEnvironment=OLLAMA_HOST=0.0.0.0\n' | sudo tee /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload && sudo systemctl restart ollama
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow ssh && sudo ufw allow in on tailscale0 && sudo ufw --force enable
if [ "$TS_AUTHKEY" != "TS_AUTHKEY_PLACEHOLDER" ]; then
  sudo tailscale up --auth-key="$TS_AUTHKEY" --hostname=allmythings-lambda-gpu --ssh
fi
ollama pull qwen3-vl:30b-a3b-instruct
curl -sf http://localhost:11434/v1/models | grep -q "30b-a3b" && echo "ollama serving 30B"
REMOTE

echo
echo "== DONE =="
if [ "$TS_AUTHKEY" = "TS_AUTHKEY_PLACEHOLDER" ]; then
  echo "Next: ssh ubuntu@$IP && sudo tailscale up   (then: tailscale ip -4)"
  TS_IP="<tailscale-ip-after-manual-join>"
else
  TS_IP=$(ssh ubuntu@"$IP" "tailscale ip -4 2>/dev/null || echo pending")
fi
cat <<EOF
Add to api-service/.env (then: launchctl kickstart -k gui/\$(id -u)/com.allmythings.api):
  QUALITY_VLM_URL=http://$TS_IP:11434/v1
  QUALITY_VLM_API_KEY=
  QUALITY_VLM_MODEL=qwen3-vl:30b-a3b-instruct
Verify:  make quality-doctor
A/B:     DETECT_TIER=quality node eval/harness.mjs api:lambda-a100
Stop billing anytime:  ./destroy.sh $ID
EOF
