#!/usr/bin/env bash
# Build and publish corescope-rx to https://rx.on8ar.eu
# Reverse proxy: root@94.130.105.135 (nginx, serves /var/www/rx.on8ar.eu, TLS via certbot).
# Content-only updates need just this script — no nginx/cert changes.
set -euo pipefail

KEY="${RX_DEPLOY_KEY:-$HOME/.ssh/claude_mcp}"
HOST="${RX_DEPLOY_HOST:-root@94.130.105.135}"
DEST="/var/www/rx.on8ar.eu/"

echo "[rx] building (uses .env.local for VITE_MQTT_*)..."
npm run build

echo "[rx] uploading dist/ -> $HOST:$DEST ..."
scp -i "$KEY" -o StrictHostKeyChecking=no -r dist/. "$HOST:$DEST"

echo "[rx] done. Live at https://rx.on8ar.eu"
