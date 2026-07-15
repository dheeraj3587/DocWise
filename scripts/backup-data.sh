#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${DOCWISE_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${DOCWISE_BACKUP_DIR:-$ROOT_DIR/backups}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
DAY_OF_WEEK="$(date -u +%u)"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_FILE="$BACKUP_DIR/daily/$STAMP-postgres.sql.gz"
MINIO_FILE="$BACKUP_DIR/daily/$STAMP-minio.tar.gz"

docker compose exec -T db pg_dump \
  -U "${POSTGRES_USER:-kagaz}" \
  "${POSTGRES_DB:-kagaz}" | gzip -9 > "$DB_FILE"

MINIO_CONTAINER="$(docker compose ps -q minio)"
MINIO_MOUNT="$(docker inspect "$MINIO_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}}{{end}}{{end}}')"
if [[ -z "$MINIO_MOUNT" ]]; then
  echo "Unable to locate the MinIO /data mount" >&2
  exit 1
fi
docker run --rm -v "$MINIO_MOUNT:/source:ro" alpine:3.20 \
  tar -C /source -czf - . > "$MINIO_FILE"

if [[ "$DAY_OF_WEEK" == "7" ]]; then
  cp "$DB_FILE" "$BACKUP_DIR/weekly/"
  cp "$MINIO_FILE" "$BACKUP_DIR/weekly/"
fi

find "$BACKUP_DIR/daily" -type f -mtime +7 -delete
find "$BACKUP_DIR/weekly" -type f -mtime +28 -delete

printf 'Backup complete:\n  %s\n  %s\n' "$DB_FILE" "$MINIO_FILE"
