#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <postgres.sql.gz> <minio.tar.gz>" >&2
  exit 2
fi

ROOT_DIR="${DOCWISE_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DB_FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
MINIO_FILE="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

test -f "$DB_FILE"
test -f "$MINIO_FILE"

docker compose stop backend worker beat frontend
docker compose exec -T db dropdb --if-exists --force \
  -U "${POSTGRES_USER:-kagaz}" "${POSTGRES_DB:-kagaz}"
docker compose exec -T db createdb \
  -U "${POSTGRES_USER:-kagaz}" "${POSTGRES_DB:-kagaz}"
gunzip -c "$DB_FILE" | docker compose exec -T db psql \
  -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-kagaz}" "${POSTGRES_DB:-kagaz}"

MINIO_CONTAINER="$(docker compose ps -q minio)"
MINIO_VOLUME="$(docker inspect "$MINIO_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}}{{end}}{{end}}')"
if [[ -z "$MINIO_VOLUME" ]]; then
  echo "Unable to locate the MinIO /data mount" >&2
  exit 1
fi
docker compose stop minio
gunzip -c "$MINIO_FILE" | docker run --rm -i \
  -v "$MINIO_VOLUME:/restore" alpine:3.20 \
  sh -c 'rm -rf /restore/* /restore/.[!.]* /restore/..?* 2>/dev/null || true; tar -C /restore -xf -'
docker compose up -d minio backend worker beat frontend nginx

echo "Restore complete. Verify with: curl -f http://localhost/api/ready"
