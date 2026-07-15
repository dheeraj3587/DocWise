# DocWise Backend Operations

DocWise targets one Docker Compose VPS. PostgreSQL and MinIO are authoritative;
Redis is disposable. This design recovers from API, worker, provider, and Redis
process failures, but the VPS, PostgreSQL container/volume, and MinIO volume are
single-instance infrastructure limits.

## Deploy

1. Run `scripts/backup-data.sh`.
2. Pull the new images and run `docker compose up --no-build --abort-on-container-exit migrate`.
3. Start `backend`, `worker`, `beat`, `frontend`, and `nginx`.
4. Require `/api/ready` to pass before completing deployment.
5. If migration or readiness fails, restore the previous image tags. Restore data
   only when the migration changed data incompatibly.

## Migrate Existing Data

Run this after the Alembic migration and after users have signed in once so their
Clerk subject is available:

```bash
docker compose exec backend python scripts/migrate_and_reindex.py --dry-run
docker compose exec backend python scripts/migrate_and_reindex.py --step all
```

The command is repeatable. It backfills file owners, creates deterministic named
threads for legacy file chats, and queues only files that need the current
embedding version. Celery Beat drains the durable outbox.

## Backup And Restore

Schedule `scripts/backup-data.sh` daily with cron. It retains seven daily and four
weekly PostgreSQL and MinIO snapshots by default. Store a second copy outside the
VPS; local backups do not protect against host loss.

```bash
scripts/restore-data.sh \
  backups/daily/<stamp>-postgres.sql.gz \
  backups/daily/<stamp>-minio.tar.gz
```

Exercise restore on a disposable Compose project before relying on a backup.

## Recovery Checks

- `docker compose ps`
- `curl -f https://app.dheerajjoshi.dev/api/live`
- `curl -f https://app.dheerajjoshi.dev/api/ready`
- `docker compose logs --tail=200 backend worker beat`
- `docker compose exec backend alembic -c alembic.ini current`

Failed streams are persisted as retryable messages and refunded. Stale processing
jobs are requeued by the watchdog. Outbox events remain in PostgreSQL when Redis or
Celery dispatch is unavailable.
