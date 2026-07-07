#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${DOCWISE_VPS_APP_DIR:-/root/DocWise}"
COMPOSE="${DOCWISE_COMPOSE:-docker compose}"
PUBLIC_URL="${DOCWISE_PUBLIC_URL:-https://app.dheerajjoshi.dev}"
REMOTE="${DOCWISE_VPS_SSH:-root@147.182.140.59}"
SCRIPT_PATH="scripts/sync-nginx-proxy.sh"
CONFIG_PATH="nginx/default.conf"

usage() {
  cat <<'USAGE'
Usage:
  npm run deploy:nginx
  bash scripts/sync-nginx-proxy.sh
  bash scripts/sync-nginx-proxy.sh --local

Environment overrides:
  DOCWISE_VPS_SSH=root@147.182.140.59
  DOCWISE_VPS_APP_DIR=/root/DocWise
  DOCWISE_PUBLIC_URL=https://app.dheerajjoshi.dev
  DOCWISE_STORAGE_TEST_URL=https://app.dheerajjoshi.dev/storage/...

Default mode copies nginx/default.conf and this script to the VPS, then validates
and reloads nginx there. --local runs the validation/reload inside the current
server checkout, useful from CI after git pull/reset.
USAGE
}

require_fixed_storage_proxy() {
  if ! grep -q 'proxy_pass http://minio:9000/;' "$CONFIG_PATH"; then
    echo "ERROR: $CONFIG_PATH does not contain the fixed MinIO storage proxy."
    echo "Expected: proxy_pass http://minio:9000/;"
    exit 1
  fi

  if grep -q 'proxy_pass http://$minio_upstream' "$CONFIG_PATH"; then
    echo "ERROR: $CONFIG_PATH still contains the old broken minio_upstream proxy."
    exit 1
  fi
}

run_local_reload() {
  cd "$APP_DIR"
  require_fixed_storage_proxy

  echo "==> Validating nginx config file..."
  $COMPOSE exec -T nginx nginx -t

  echo "==> Reloading nginx..."
  if ! $COMPOSE exec -T nginx nginx -s reload; then
    echo "==> Reload failed, restarting nginx container..."
    $COMPOSE restart nginx
  fi

  echo "==> Checking active nginx config..."
  $COMPOSE exec -T nginx nginx -T 2>/dev/null | grep -q 'proxy_pass http://minio:9000/;'

  echo "==> Checking API health..."
  curl -fsS "$PUBLIC_URL/api/health" >/dev/null

  if [ -n "${DOCWISE_STORAGE_TEST_URL:-}" ]; then
    echo "==> Checking storage proxy with DOCWISE_STORAGE_TEST_URL..."
    curl -fsS -r 0-0 "$DOCWISE_STORAGE_TEST_URL" >/dev/null
  fi

  echo "==> Nginx storage proxy is synced and healthy."
}

run_remote_sync() {
  if [ ! -f "$CONFIG_PATH" ]; then
    echo "ERROR: run this from the DocWise repo root. Missing $CONFIG_PATH."
    exit 1
  fi

  if [ ! -f "$SCRIPT_PATH" ]; then
    echo "ERROR: missing $SCRIPT_PATH."
    exit 1
  fi

  require_fixed_storage_proxy

  echo "==> Preparing remote script directory on $REMOTE..."
  ssh "$REMOTE" "mkdir -p '$APP_DIR/nginx' '$APP_DIR/scripts'"

  echo "==> Copying nginx config and reload script..."
  scp "$CONFIG_PATH" "$REMOTE:$APP_DIR/$CONFIG_PATH"
  scp "$SCRIPT_PATH" "$REMOTE:$APP_DIR/$SCRIPT_PATH"

  echo "==> Validating and reloading nginx on VPS..."
  ssh "$REMOTE" "cd '$APP_DIR' && DOCWISE_VPS_APP_DIR='$APP_DIR' DOCWISE_PUBLIC_URL='$PUBLIC_URL' DOCWISE_STORAGE_TEST_URL='${DOCWISE_STORAGE_TEST_URL:-}' bash '$SCRIPT_PATH' --local"
}

case "${1:-}" in
  -h|--help)
    usage
    ;;
  --local)
    run_local_reload
    ;;
  "")
    run_remote_sync
    ;;
  *)
    echo "ERROR: unknown argument: $1"
    usage
    exit 1
    ;;
esac
