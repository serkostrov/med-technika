/**
 * Хранилище состояния сервера в Postgres (Supabase).
 *
 * Схема `medtech` (не публикуется через PostgREST → anon/authenticated
 * не видят данные напрямую, доступ только у Node-сервиса):
 *   app_state  — одна строка: все таблицы SecureApi (jsonb)
 *   app_blobs  — файлы: исходники Excel, PDF-сканы, XML-выгрузки
 *
 * Файлы пишутся инкрементально (только новые/удалённые), таблицы — целиком
 * в одной транзакции вместе с файлами.
 */

export type BlobKind = 'protocol_source' | 'protocol_scan' | 'fgis_export'

export type BlobRecord = {
  kind: BlobKind
  path: string
  meta: Record<string, unknown>
  bytes: Uint8Array | null
}

export type StoredState = {
  tables: Record<string, unknown>
  blobs: BlobRecord[]
}

export type StateChange = {
  /** JSON таблиц (null — таблицы не менялись) */
  tablesJson: string | null
  upsertBlobs: BlobRecord[]
  deleteBlobs: Array<{ kind: BlobKind; path: string }>
}

export interface StateStore {
  init(): Promise<void>
  load(): Promise<StoredState | null>
  save(change: StateChange): Promise<void>
  close(): Promise<void>
}

/** Минимальный SQL-интерфейс: реализуется и `pg.Pool`, и PGlite. */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>
}

export interface SqlDatabase extends SqlExecutor {
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>
  end(): Promise<void>
}

export const SCHEMA_STATEMENTS: readonly string[] = [
  `create schema if not exists medtech`,
  `create table if not exists medtech.app_state (
    id smallint primary key default 1 check (id = 1),
    version integer not null default 1,
    tables jsonb not null,
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists medtech.app_blobs (
    kind text not null check (kind in ('protocol_source', 'protocol_scan', 'fgis_export')),
    path text not null,
    meta jsonb not null,
    bytes bytea,
    updated_at timestamptz not null default now(),
    primary key (kind, path)
  )`,
]

function toUint8(v: unknown): Uint8Array | null {
  if (v == null) return null
  if (v instanceof Uint8Array) return v
  if (typeof v === 'string' && v.startsWith('\\x')) {
    // bytea в hex-формате (если драйвер не распарсил)
    const hex = v.slice(2)
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    return out
  }
  throw new Error('Неожиданный формат bytea')
}

function parseJson(v: unknown): Record<string, unknown> {
  if (typeof v === 'string') return JSON.parse(v) as Record<string, unknown>
  return (v ?? {}) as Record<string, unknown>
}

export class PgStateStore implements StateStore {
  private readonly sql: SqlDatabase

  constructor(sql: SqlDatabase) {
    this.sql = sql
  }

  async init(): Promise<void> {
    for (const stmt of SCHEMA_STATEMENTS) {
      await this.sql.query(stmt)
    }
  }

  async load(): Promise<StoredState | null> {
    const state = await this.sql.query<{ tables: unknown }>(
      `select tables from medtech.app_state where id = 1`,
    )
    const row = state.rows[0]
    if (!row) return null
    const blobs = await this.sql.query<{
      kind: BlobKind
      path: string
      meta: unknown
      bytes: unknown
    }>(`select kind, path, meta, bytes from medtech.app_blobs`)
    return {
      tables: parseJson(row.tables),
      blobs: blobs.rows.map((b) => ({
        kind: b.kind,
        path: b.path,
        meta: parseJson(b.meta),
        bytes: toUint8(b.bytes),
      })),
    }
  }

  async save(change: StateChange): Promise<void> {
    await this.sql.transaction(async (tx) => {
      if (change.tablesJson !== null) {
        await tx.query(
          `insert into medtech.app_state (id, version, tables, updated_at)
           values (1, 1, $1::jsonb, now())
           on conflict (id) do update
             set tables = excluded.tables, updated_at = now()`,
          [change.tablesJson],
        )
      }
      for (const b of change.upsertBlobs) {
        await tx.query(
          `insert into medtech.app_blobs (kind, path, meta, bytes, updated_at)
           values ($1, $2, $3::jsonb, $4, now())
           on conflict (kind, path) do update
             set meta = excluded.meta, bytes = excluded.bytes, updated_at = now()`,
          [b.kind, b.path, JSON.stringify(b.meta), b.bytes],
        )
      }
      for (const d of change.deleteBlobs) {
        await tx.query(
          `delete from medtech.app_blobs where kind = $1 and path = $2`,
          [d.kind, d.path],
        )
      }
    })
  }

  async close(): Promise<void> {
    await this.sql.end()
  }
}
