import type { Database } from '@/server/db/database'
import {
  exportDatabaseTables,
  importDatabaseSnapshot,
  type DatabaseSnapshot,
} from '@/server/db/backup'
import type {
  BlobKind,
  BlobRecord,
  StateChange,
  StateStore,
  StoredState,
} from './state-store'

type BlobMaps = {
  protocol_source: Database['protocolSources']
  protocol_scan: Database['protocolScans']
  fgis_export: Database['fgisExportFiles']
}

const KINDS: BlobKind[] = ['protocol_source', 'protocol_scan', 'fgis_export']

function maps(db: Database): BlobMaps {
  return {
    protocol_source: db.protocolSources,
    protocol_scan: db.protocolScans,
    fgis_export: db.fgisExportFiles,
  }
}

function key(kind: BlobKind, path: string): string {
  return `${kind}\u0000${path}`
}

function toBase64(bytes: Uint8Array | null): string {
  if (!bytes) return ''
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    'base64',
  )
}

function blobRecord(kind: BlobKind, value: object): BlobRecord {
  if (kind === 'fgis_export') {
    const v = value as Database['fgisExportFiles'] extends Map<string, infer V>
      ? V
      : never
    return {
      kind,
      path: v.path,
      meta: {
        fileName: v.fileName,
        xml: v.xml,
        previewXml: v.previewXml,
        createdAt: v.createdAt,
        createdBy: v.createdBy,
      },
      bytes: null,
    }
  }
  const { bytes, path, ...meta } = value as {
    bytes: ArrayBuffer
    path: string
  } & Record<string, unknown>
  return { kind, path, meta, bytes: new Uint8Array(bytes) }
}

/** Собрать снимок формата бэкапа из того, что лежит в Postgres. */
export function storedStateToSnapshot(state: StoredState): DatabaseSnapshot {
  const snap: DatabaseSnapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: state.tables,
    blobs: { protocolSources: [], protocolScans: [], fgisExportFiles: [] },
  }
  for (const b of state.blobs) {
    const m = b.meta as Record<string, string>
    if (b.kind === 'protocol_source') {
      snap.blobs.protocolSources.push({
        path: b.path,
        sha256: m.sha256 ?? '',
        fileName: m.fileName ?? '',
        uploadedAt: m.uploadedAt ?? '',
        bytesBase64: toBase64(b.bytes),
      })
    } else if (b.kind === 'protocol_scan') {
      snap.blobs.protocolScans.push({
        path: b.path,
        fileName: m.fileName ?? '',
        uploadedAt: m.uploadedAt ?? '',
        uploadedBy: m.uploadedBy ?? '',
        bytesBase64: toBase64(b.bytes),
      })
    } else {
      snap.blobs.fgisExportFiles.push({
        path: b.path,
        fileName: m.fileName ?? '',
        xml: m.xml ?? '',
        previewXml: m.previewXml ?? '',
        createdAt: m.createdAt ?? '',
        createdBy: m.createdBy ?? '',
      })
    }
  }
  return snap
}

/**
 * Синхронизация in-memory Database ↔ StateStore.
 * Сохранения выполняются строго последовательно; каждое берёт актуальное
 * состояние на момент запуска. Пустые изменения в базу не пишутся.
 */
export class DbPersister {
  private readonly db: Database
  private readonly store: StateStore
  /** Что уже лежит в базе: ключ файла → ссылка на объект в Map */
  private savedBlobs = new Map<string, object>()
  private savedTablesJson: string | null = null
  private chain: Promise<void> = Promise.resolve()

  constructor(db: Database, store: StateStore) {
    this.db = db
    this.store = store
  }

  /** Загрузить состояние из базы. false — база пустая (первый запуск). */
  async load(): Promise<boolean> {
    const state = await this.store.load()
    if (!state) return false
    importDatabaseSnapshot(this.db, storedStateToSnapshot(state))
    this.markAllSaved()
    return true
  }

  private markAllSaved(): void {
    this.savedTablesJson = JSON.stringify(exportDatabaseTables(this.db))
    this.savedBlobs = new Map()
    const m = maps(this.db)
    for (const kind of KINDS) {
      for (const [path, value] of m[kind]) {
        this.savedBlobs.set(key(kind, path), value)
      }
    }
  }

  /** Вычислить изменения относительно последнего сохранения. */
  diff(): { change: StateChange; nextBlobs: Map<string, object>; tablesJson: string } {
    const tablesJson = JSON.stringify(exportDatabaseTables(this.db))
    const upsertBlobs: BlobRecord[] = []
    const deleteBlobs: StateChange['deleteBlobs'] = []
    const nextBlobs = new Map<string, object>()
    const m = maps(this.db)
    for (const kind of KINDS) {
      for (const [path, value] of m[kind]) {
        const k = key(kind, path)
        nextBlobs.set(k, value)
        if (this.savedBlobs.get(k) !== value) {
          upsertBlobs.push(blobRecord(kind, value))
        }
      }
    }
    for (const k of this.savedBlobs.keys()) {
      if (!nextBlobs.has(k)) {
        const [kind, path] = k.split('\u0000') as [BlobKind, string]
        deleteBlobs.push({ kind, path })
      }
    }
    return {
      change: {
        tablesJson: tablesJson === this.savedTablesJson ? null : tablesJson,
        upsertBlobs,
        deleteBlobs,
      },
      nextBlobs,
      tablesJson,
    }
  }

  /** Записать изменения (если есть). Ошибка пробрасывается вызывающему. */
  save(): Promise<void> {
    const run = async () => {
      const { change, nextBlobs, tablesJson } = this.diff()
      if (
        change.tablesJson === null &&
        change.upsertBlobs.length === 0 &&
        change.deleteBlobs.length === 0
      ) {
        return
      }
      await this.store.save(change)
      this.savedTablesJson = tablesJson
      this.savedBlobs = nextBlobs
    }
    // После ошибки цепочка не «залипает» — следующее сохранение повторит запись.
    const next = this.chain.then(run, run)
    this.chain = next.catch(() => undefined)
    return next
  }
}
