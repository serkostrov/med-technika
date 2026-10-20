import { bootstrapServer, type SecureApi } from '@/server'
import type { Database } from '@/server/db/database'
import {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  type DatabaseSnapshot,
} from '@/server/db/backup'

/**
 * Единый in-memory сервер на вкладку браузера (portable SPA).
 * Данные справочников/протоколов хранятся в localStorage и
 * НЕ сбрасываются при выходе из аккаунта (logout чистит только сессию).
 */
const PERSIST_KEY = 'mt.db.v1'
const LEGACY_SESSION_KEY = 'mt.db.v1' // раньше писали в sessionStorage

function persistEnabled(): boolean {
  const flag = import.meta.env.VITE_PERSIST_LOCAL_DB
  if (flag === 'false' || flag === '0') return false
  // По умолчанию ВКЛЮЧЕНО: без Postgres portable SPA иначе теряет данные.
  return true
}

function storage(): Storage | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage
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

function writeSnapshot(db: Database): void {
  const store = storage()
  if (!persistEnabled() || !store) return
  try {
    const snap = exportDatabaseSnapshot(db)
    store.setItem(PERSIST_KEY, JSON.stringify(snap))
    // миграция: убрать устаревший снимок из sessionStorage
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(LEGACY_SESSION_KEY)
    }
  } catch {
    /* quota / private mode */
  }
}

/** Отложенное сохранение снимка БД. */
export function persistSharedDb(): void {
  if (!persistEnabled() || !dbRef) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (dbRef) writeSnapshot(dbRef)
  }, 50)
}

/** Немедленная запись (перед logout / закрытием вкладки). */
export function flushPersistSharedDb(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (dbRef) writeSnapshot(dbRef)
}

/**
 * Сброс in-memory API.
 * По умолчанию НЕ трогает localStorage — данные справочников сохраняются.
 * wipeStorage=true — полный сброс (только явный «сброс демо» / тесты).
 */
export function resetSharedApi(options?: { wipeStorage?: boolean }): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!options?.wipeStorage) {
    flushPersistSharedDb()
  }
  apiPromise = null
  dbRef = null
  if (options?.wipeStorage) {
    storage()?.removeItem(PERSIST_KEY)
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(LEGACY_SESSION_KEY)
    }
  }
}

function restoreIfPresent(db: Database): void {
  if (!persistEnabled()) return
  const store = storage()
  if (!store) return

  let raw = store.getItem(PERSIST_KEY)
  // Миграция со старого sessionStorage → localStorage
  if (!raw && typeof sessionStorage !== 'undefined') {
    raw = sessionStorage.getItem(LEGACY_SESSION_KEY)
    if (raw) {
      try {
        store.setItem(PERSIST_KEY, raw)
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem(LEGACY_SESSION_KEY)
    }
  }
  if (!raw) return
  try {
    const snap = JSON.parse(raw) as DatabaseSnapshot
    importDatabaseSnapshot(db, snap)
  } catch {
    store.removeItem(PERSIST_KEY)
  }
}

/** Для beforeunload — дописать снимок, если есть незаписанный таймер. */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    flushPersistSharedDb()
  })
}
