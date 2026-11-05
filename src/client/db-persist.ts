/**
 * Портативное хранилище снимка in-memory БД.
 * Предпочтительно IndexedDB (большой лимит); fallback — localStorage.
 * Миграция: sessionStorage / localStorage → IndexedDB.
 */

export const PERSIST_KEY = 'mt.db.v1'
export const PERSIST_BAK_KEY = 'mt.db.v1.bak'
export const PERSIST_QUARANTINE_KEY = 'mt.db.v1.quarantine'

const IDB_NAME = 'mt-persist'
const IDB_VERSION = 1
const IDB_STORE = 'snapshots'
const LEGACY_SESSION_KEY = 'mt.db.v1'

export type SnapshotStore = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

type PersistFailureListener = (error: Error) => void

const failureListeners = new Set<PersistFailureListener>()

/** Подписка на ошибки записи/чтения снимка (для toast в UI). */
export function onPersistFailure(listener: PersistFailureListener): () => void {
  failureListeners.add(listener)
  return () => {
    failureListeners.delete(listener)
  }
}

export function emitPersistFailure(error: Error): void {
  for (const listener of failureListeners) {
    try {
      listener(error)
    } catch {
      /* ignore listener errors */
    }
  }
}

let injectedStore: SnapshotStore | null = null

/** Только для тестов: подменить бэкенд хранилища. */
export function setSnapshotStoreForTests(store: SnapshotStore | null): void {
  injectedStore = store
}

function localStorageStore(): SnapshotStore | null {
  if (typeof localStorage === 'undefined') return null
  return {
    async get(key) {
      return localStorage.getItem(key)
    },
    async set(key, value) {
      localStorage.setItem(key, value)
    },
    async remove(key) {
      localStorage.removeItem(key)
    },
  }
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступен'))
      return
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () =>
      reject(req.error ?? new Error('Не удалось открыть IndexedDB'))
  })
}

function idbStore(): SnapshotStore {
  const withStore = async <T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await openIdb()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode)
      const store = tx.objectStore(IDB_STORE)
      const req = fn(store)
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () =>
        reject(req.error ?? new Error('Ошибка IndexedDB'))
      tx.onabort = () =>
        reject(tx.error ?? new Error('Транзакция IndexedDB прервана'))
    })
  }

  return {
    async get(key) {
      const value = await withStore('readonly', (s) => s.get(key))
      if (value == null) return null
      return typeof value === 'string' ? value : String(value)
    },
    async set(key, value) {
      await withStore('readwrite', (s) => s.put(value, key))
    },
    async remove(key) {
      await withStore('readwrite', (s) => s.delete(key))
    },
  }
}

let cachedStore: SnapshotStore | null = null
let cachedStorePromise: Promise<SnapshotStore> | null = null

async function resolveStore(): Promise<SnapshotStore> {
  if (injectedStore) return injectedStore
  if (cachedStore) return cachedStore
  if (!cachedStorePromise) {
    cachedStorePromise = (async () => {
      try {
        const store = idbStore()
        // Пробный round-trip, чтобы сразу упасть на fallback при private mode и т.п.
        await store.get(PERSIST_KEY)
        cachedStore = store
        return store
      } catch {
        const ls = localStorageStore()
        if (!ls) {
          throw new Error(
            'Локальное хранилище недоступно (IndexedDB и localStorage)',
          )
        }
        cachedStore = ls
        return ls
      }
    })()
  }
  return cachedStorePromise
}

/** Сброс кэша адаптера (тесты / смена бэкенда). */
export function resetSnapshotStoreCache(): void {
  cachedStore = null
  cachedStorePromise = null
}

function readLegacyWebStorage(): string | null {
  if (typeof localStorage !== 'undefined') {
    const fromLs = localStorage.getItem(PERSIST_KEY)
    if (fromLs) return fromLs
  }
  if (typeof sessionStorage !== 'undefined') {
    const fromSs = sessionStorage.getItem(LEGACY_SESSION_KEY)
    if (fromSs) return fromSs
  }
  return null
}

function clearLegacyWebStorage(): void {
  try {
    localStorage?.removeItem(PERSIST_KEY)
    localStorage?.removeItem(PERSIST_BAK_KEY)
  } catch {
    /* ignore */
  }
  try {
    sessionStorage?.removeItem(LEGACY_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Атомарная запись: сначала bak, затем основной ключ.
 * При ошибке основного bak остаётся последней хорошей копией.
 */
export async function writeSnapshotRaw(json: string): Promise<void> {
  const store = await resolveStore()
  await store.set(PERSIST_BAK_KEY, json)
  await store.set(PERSIST_KEY, json)
}

async function quarantine(store: SnapshotStore, key: string, raw: string): Promise<void> {
  try {
    await store.set(PERSIST_QUARANTINE_KEY, raw)
  } catch {
    /* ignore quarantine write failure */
  }
  try {
    await store.remove(key)
  } catch {
    /* leave broken key if remove fails */
  }
}

/**
 * Чтение снимка: primary → bak → legacy web storage.
 * Битый primary уходит в quarantine; пробуем bak.
 */
export async function readSnapshotRaw(): Promise<string | null> {
  const store = await resolveStore()

  const tryParse = (raw: string): boolean => {
    try {
      JSON.parse(raw)
      return true
    } catch {
      return false
    }
  }

  const primary = await store.get(PERSIST_KEY)
  if (primary) {
    if (tryParse(primary)) {
      clearLegacyWebStorage()
      return primary
    }
    await quarantine(store, PERSIST_KEY, primary)
    emitPersistFailure(
      new Error('Снимок данных повреждён — восстановление из резервной копии'),
    )
  }

  const bak = await store.get(PERSIST_BAK_KEY)
  if (bak) {
    if (tryParse(bak)) {
      try {
        await store.set(PERSIST_KEY, bak)
      } catch {
        /* bak всё равно вернём */
      }
      clearLegacyWebStorage()
      return bak
    }
    await quarantine(store, PERSIST_BAK_KEY, bak)
  }

  const legacy = readLegacyWebStorage()
  if (legacy && tryParse(legacy)) {
    try {
      await writeSnapshotRaw(legacy)
      clearLegacyWebStorage()
    } catch (err) {
      emitPersistFailure(
        err instanceof Error
          ? err
          : new Error('Не удалось мигрировать снимок в IndexedDB'),
      )
    }
    return legacy
  }

  if (legacy) {
    // Битый legacy — не трогаем IDB, просто игнорируем
    clearLegacyWebStorage()
  }

  return null
}

export async function clearAllSnapshots(): Promise<void> {
  const store = await resolveStore()
  await store.remove(PERSIST_KEY)
  await store.remove(PERSIST_BAK_KEY)
  await store.remove(PERSIST_QUARANTINE_KEY)
  clearLegacyWebStorage()
}
