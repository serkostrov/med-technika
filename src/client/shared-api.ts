import { bootstrapServer, type SecureApi } from '@/server'
import type { Database } from '@/server/db/database'
import {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  type DatabaseSnapshot,
} from '@/server/db/backup'
import {
  clearAllSnapshots,
  emitPersistFailure,
  readSnapshotRaw,
  writeSnapshotRaw,
} from '@/client/db-persist'

/**
 * Единый in-memory сервер на вкладку браузера (portable SPA).
 * Данные справочников/протоколов хранятся в IndexedDB (fallback localStorage)
 * и НЕ сбрасываются при выходе из аккаунта (logout чистит только сессию).
 */

function persistEnabled(): boolean {
  const flag = import.meta.env.VITE_PERSIST_LOCAL_DB
  if (flag === 'false' || flag === '0') return false
  // По умолчанию ВКЛЮЧЕНО: без Postgres portable SPA иначе теряет данные.
  return true
}

let apiPromise: Promise<SecureApi> | null = null
let dbRef: Database | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistChain: Promise<void> = Promise.resolve()

export function getSharedApi(): Promise<SecureApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const { api, db } = await bootstrapServer()
      dbRef = db
      await restoreIfPresent(db)
      return api
    })()
  }
  return apiPromise
}

export function getDbRefForTests(): Database | null {
  return dbRef
}

async function writeSnapshot(db: Database): Promise<void> {
  if (!persistEnabled()) return
  try {
    const snap = exportDatabaseSnapshot(db)
    await writeSnapshotRaw(JSON.stringify(snap))
  } catch (err) {
    const error =
      err instanceof Error
        ? err
        : new Error('Не удалось сохранить данные локально')
    emitPersistFailure(error)
    throw error
  }
}

function enqueuePersist(db: Database): Promise<void> {
  const run = () => writeSnapshot(db)
  // После ошибки цепочка не должна «залипать» — следующий flush всё равно пишет.
  persistChain = persistChain.then(run, run)
  return persistChain
}

/** Отложенное сохранение снимка БД (ошибки → onPersistFailure). */
export function persistSharedDb(): void {
  if (!persistEnabled() || !dbRef) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const db = dbRef
    if (!db) return
    void enqueuePersist(db).catch(() => {
      /* уже в emitPersistFailure */
    })
  }, 50)
}

/** Немедленная запись (перед logout / закрытием вкладки / бэкапом). */
export async function flushPersistSharedDb(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!persistEnabled() || !dbRef) {
    await persistChain.catch(() => undefined)
    return
  }
  await enqueuePersist(dbRef)
}

/**
 * Сброс in-memory API.
 * По умолчанию НЕ трогает хранилище — данные справочников сохраняются.
 * wipeStorage=true — полный сброс (только явный «сброс демо» / тесты).
 *
 * Logout НЕ должен вызывать эту функцию — достаточно clearSession().
 */
export async function resetSharedApi(options?: {
  wipeStorage?: boolean
}): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!options?.wipeStorage && dbRef) {
    try {
      await flushPersistSharedDb()
    } catch {
      /* already emitted */
    }
  }
  apiPromise = null
  dbRef = null
  if (options?.wipeStorage) {
    await clearAllSnapshots().catch(() => undefined)
  }
}

async function restoreIfPresent(db: Database): Promise<void> {
  if (!persistEnabled()) return
  let raw: string | null
  try {
    raw = await readSnapshotRaw()
  } catch (err) {
    emitPersistFailure(
      err instanceof Error
        ? err
        : new Error('Не удалось прочитать локальный снимок'),
    )
    return
  }
  if (!raw) return
  try {
    const snap = JSON.parse(raw) as DatabaseSnapshot
    importDatabaseSnapshot(db, snap)
  } catch (err) {
    emitPersistFailure(
      err instanceof Error
        ? err
        : new Error('Снимок данных повреждён и не может быть загружен'),
    )
  }
}

/** Экспорт текущего снимка (для UI бэкапа). */
export async function exportSharedDbSnapshot(): Promise<DatabaseSnapshot> {
  const api = await getSharedApi()
  await flushPersistSharedDb()
  const db = api.getDbForTests()
  return exportDatabaseSnapshot(db)
}

/** Импорт снимка из файла / JSON (для UI восстановления). */
export async function importSharedDbSnapshot(
  snap: DatabaseSnapshot,
): Promise<void> {
  const api = await getSharedApi()
  const db = api.getDbForTests()
  importDatabaseSnapshot(db, snap)
  await flushPersistSharedDb()
}

/** Для beforeunload — дописать снимок, если есть незаписанный таймер. */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flushPersistSharedDb()
  })
}
