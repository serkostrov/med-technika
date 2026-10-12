import { bootstrapServer, type SecureApi } from '@/server'
import type { Database } from '@/server/db/database'
import {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  type DatabaseSnapshot,
} from '@/server/db/backup'

/**
 * Единый in-memory сервер на вкладку браузера (dev / portable SPA).
 * Production: VITE_PERSIST_LOCAL_DB=false — без снимка в sessionStorage;
 * целевое хранилище — Postgres (supabase/migrations + seed).
 */
const PERSIST_KEY = 'mt.db.v1'

function persistEnabled(): boolean {
  const flag = import.meta.env.VITE_PERSIST_LOCAL_DB
  if (flag === 'false' || flag === '0') return false
  if (flag === 'true' || flag === '1') return true
  // По умолчанию: только вне production-сборки
  return import.meta.env.MODE !== 'production'
}

let apiPromise: Promise<SecureApi> | null = null
let dbRef: Database | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

export function getSharedApi(): Promise<SecureApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const { api, db } = await bootstrapServer()
      dbRef = db
      restoreIfPresent(db)
      return api
    })()
  }
  return apiPromise
}

/** Сохранить снимок БД (dev). В production по умолчанию отключено. */
export function persistSharedDb(): void {
  if (!persistEnabled() || !dbRef || typeof sessionStorage === 'undefined') return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    try {
      const snap = exportDatabaseSnapshot(dbRef!)
      sessionStorage.setItem(PERSIST_KEY, JSON.stringify(snap))
    } catch {
      /* quota / private mode */
    }
  }, 50)
}

export function resetSharedApi(): void {
  apiPromise = null
  dbRef = null
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(PERSIST_KEY)
  }
}

function restoreIfPresent(db: Database): void {
  if (!persistEnabled() || typeof sessionStorage === 'undefined') return
  const raw = sessionStorage.getItem(PERSIST_KEY)
  if (!raw) return
  try {
    const snap = JSON.parse(raw) as DatabaseSnapshot
    importDatabaseSnapshot(db, snap)
  } catch {
    sessionStorage.removeItem(PERSIST_KEY)
  }
}
