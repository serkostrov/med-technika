# Резервное копирование и восстановление (ТЗ §16)

## Dev runtime (in-memory Database)

В разработке данные живут в portable слое `src/server/db`. Снимок в `sessionStorage` (`mt.db.v1`) пишется **только если** `VITE_PERSIST_LOCAL_DB` не выключен (в production-сборке по умолчанию выключен).

1. **Создать снимок** — `exportDatabaseSnapshot(db)` → JSON (таблицы + blobs base64).
2. **Восстановить** — `importDatabaseSnapshot(db, snap)`.
3. **CLI-шаблон** — `node scripts/backup-restore.mjs backup backups/mt.json`.

Храните снимки вне контейнера (volume / S3). Retention: **14 дней** (ТЗ).

Автотест round-trip: `src/server/db/backup.test.ts`.

## Целевой Postgres + Storage

После переноса на Supabase/Postgres:

```bash
# БД (подставьте URL своего Postgres / Supabase)
pg_dump -Fc -f backups/db-$(date +%F).dump "postgresql://…"

# Storage buckets: protocol-sources, protocol-scans, fgis-exports
# (копирование объектами cloud tool / rclone)

# Restore drill (ежемесячно)
pg_restore --clean --if-exists -d "postgresql://…" backups/db-YYYY-MM-DD.dump
```

Cron пример (host):

```cron
0 2 * * * /opt/med-technique/scripts/pg-backup.sh && find /opt/backups -mtime +14 -delete
```

## Проверка

После restore: вход head/engineer, открытие эталонного протокола, скачивание последней выгрузки XML.
