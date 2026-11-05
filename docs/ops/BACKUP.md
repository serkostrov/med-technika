# Резервное копирование и восстановление (ТЗ §16)

## Dev runtime (in-memory Database)

В portable SPA данные живут в `src/server/db`. Снимок (`mt.db.v1` + резерв `.bak`) пишется в **IndexedDB** (БД `mt-persist`; при недоступности — localStorage). Logout сбрасывает **только** сессию входа; справочники и протоколы остаются.

Незавершённые чанковые загрузки (`pendingUploads`) в снимок **не** входят — после logout/refresh их нужно начать заново.

1. **UI** — Настройки → Основные → «Скачать резервную копию» / «Восстановить из файла».
2. **Код** — `exportDatabaseSnapshot(db)` → JSON (таблицы + blobs base64); `importDatabaseSnapshot(db, snap)`.
3. **CLI-шаблон** — `node scripts/backup-restore.mjs backup backups/mt.json`.

Храните снимки вне контейнера (volume / S3). Retention: **14 дней** (ТЗ).

Автотесты: `src/server/db/backup.test.ts`, `src/client/shared-api.persist.test.ts`.

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
