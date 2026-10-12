#!/usr/bin/env node
/**
 * Резервная копия / восстановление in-memory БД (JSON-снимок).
 * Для production Postgres: см. docs/ops/BACKUP.md (pg_dump + Storage, 14 дней).
 *
 * Usage:
 *   node scripts/backup-restore.mjs backup  [out.json]
 *   node scripts/backup-restore.mjs restore in.json
 *
 * В SPA-режиме снимок создаётся через RPC/экспорт из работающего API;
 * этот CLI — контракт и пример для Node-рантайма / CI.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const cmd = process.argv[2]
const file = resolve(process.argv[3] ?? `backups/mt-backup-${Date.now()}.json`)

if (cmd !== 'backup' && cmd !== 'restore') {
  console.error(`Usage: node scripts/backup-restore.mjs backup|restore [file]`)
  process.exit(1)
}

if (cmd === 'backup') {
  mkdirSync(dirname(file), { recursive: true })
  const stub = {
    version: 1,
    exportedAt: new Date().toISOString(),
    note:
      'Полный снимок создаётся через exportDatabaseSnapshot(db) из работающего сервера. ' +
      'Этот файл — шаблон метаданных. См. docs/ops/BACKUP.md.',
    tables: {},
    blobs: { protocolSources: [], protocolScans: [], fgisExportFiles: [] },
  }
  writeFileSync(file, JSON.stringify(stub, null, 2), 'utf8')
  console.log(`Backup template written: ${file}`)
  process.exit(0)
}

if (!existsSync(file)) {
  console.error(`File not found: ${file}`)
  process.exit(1)
}
const snap = JSON.parse(readFileSync(file, 'utf8'))
if (snap.version !== 1) {
  console.error(`Unsupported backup version: ${snap.version}`)
  process.exit(1)
}
console.log(
  `Backup OK to restore: version=${snap.version} at=${snap.exportedAt}. ` +
    `Apply via importDatabaseSnapshot(db, snap) on the running server.`,
)
