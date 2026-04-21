#!/usr/bin/env bash
# Receives Alertmanager webhook POSTs on :18080 and emits macOS notifications.
# Usage:  ./scripts/macos-notify.sh  (runs in foreground; Ctrl-C to stop)
#
# Dependencies: nc (BSD netcat), jq, osascript (built-in on macOS).
set -euo pipefail

PORT="${PORT:-18080}"

if ! command -v jq >/dev/null 2>&1; then
  echo "[macos-notify] jq is required. Install with: brew install jq" >&2
  exit 1
fi
if ! command -v osascript >/dev/null 2>&1; then
  echo "[macos-notify] This script only runs on macOS (needs osascript)." >&2
  exit 1
fi

echo "[macos-notify] Listening on :$PORT for Alertmanager webhooks..."

while true; do
  # One-shot HTTP receiver per connection
  REQ=$(nc -l "$PORT" 2>/dev/null || true) || continue
  [ -z "$REQ" ] && continue

  # Split headers from body — first blank line
  BODY=$(printf '%s\n' "$REQ" | awk 'BEGIN{h=1} /^\r?$/{h=0; next} h==0{print}')
  [ -z "$BODY" ] && continue

  # Parse each alert in .alerts[] and surface each as a notification
  echo "$BODY" | jq -c '.alerts[]?' 2>/dev/null | while read -r ALERT; do
    STATUS=$(echo "$ALERT" | jq -r '.status // "firing"')
    ALERTNAME=$(echo "$ALERT" | jq -r '.labels.alertname // "unknown"')
    SEVERITY=$(echo "$ALERT" | jq -r '.labels.severity // "info"')
    SUMMARY=$(echo "$ALERT" | jq -r '.annotations.summary // "(no summary)"')

    # Escape double-quotes for AppleScript
    ESC_SUMMARY=$(printf '%s' "$SUMMARY" | sed 's/"/\\"/g')
    ICON="Basso"  # default warning sound
    case "$SEVERITY" in
      critical) ICON="Sosumi" ;;
      warning)  ICON="Basso"  ;;
      *)        ICON="Glass"  ;;
    esac

    TITLE="[$STATUS] $ALERTNAME ($SEVERITY)"
    osascript -e "display notification \"$ESC_SUMMARY\" with title \"$TITLE\" sound name \"$ICON\"" || true
  done
done
