import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomerKindId, EquipmentKind } from '@/domain'

/**
 * Контракт персиста portable SPA:
 * - справочники живут в SnapshotStore (IndexedDB / fallback)
 * - logout НЕ вызывает resetSharedApi — память и снимок остаются
 * - resetSharedApi без wipe сохраняет снимок; wipe чистит
 * - повторный bootstrap восстанавливает изменения
 */

type SnapshotStore = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

function memoryStore(): SnapshotStore & { mem: Map<string, string> } {
  const mem = new Map<string, string>()
  return {
    mem,
    async get(key) {
      return mem.get(key) ?? null
    },
    async set(key, value) {
      mem.set(key, value)
    },
    async remove(key) {
      mem.delete(key)
    },
  }
}

describe('shared-api persist contract', () => {
  let store: ReturnType<typeof memoryStore>
  let PERSIST_KEY: string
  let PERSIST_BAK_KEY: string
  let PERSIST_QUARANTINE_KEY: string
  let onPersistFailure: (listener: (error: Error) => void) => () => void
  let setSnapshotStoreForTests: (s: SnapshotStore | null) => void
  let resetSnapshotStoreCache: () => void
  let getSharedApi: typeof import('@/client/shared-api').getSharedApi
  let flushPersistSharedDb: typeof import('@/client/shared-api').flushPersistSharedDb
  let resetSharedApi: typeof import('@/client/shared-api').resetSharedApi
  let getDbRefForTests: typeof import('@/client/shared-api').getDbRefForTests

  beforeEach(async () => {
    vi.resetModules()
    store = memoryStore()

    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } satisfies Storage)
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } satisfies Storage)

    const persist = await import('@/client/db-persist')
    PERSIST_KEY = persist.PERSIST_KEY
    PERSIST_BAK_KEY = persist.PERSIST_BAK_KEY
    PERSIST_QUARANTINE_KEY = persist.PERSIST_QUARANTINE_KEY
    onPersistFailure = persist.onPersistFailure
    setSnapshotStoreForTests = persist.setSnapshotStoreForTests
    resetSnapshotStoreCache = persist.resetSnapshotStoreCache

    resetSnapshotStoreCache()
    setSnapshotStoreForTests(store)

    const shared = await import('@/client/shared-api')
    getSharedApi = shared.getSharedApi
    flushPersistSharedDb = shared.flushPersistSharedDb
    resetSharedApi = shared.resetSharedApi
    getDbRefForTests = shared.getDbRefForTests
  })

  afterEach(() => {
    setSnapshotStoreForTests(null)
    resetSnapshotStoreCache()
    vi.unstubAllGlobals()
  })

  it('resetSharedApi without wipe keeps snapshot', async () => {
    store.mem.set(PERSIST_KEY, '{"version":1,"tables":{},"blobs":{}}')
    await resetSharedApi()
    expect(store.mem.get(PERSIST_KEY)).toBeTruthy()
  })

  it('resetSharedApi({ wipeStorage: true }) clears snapshot', async () => {
    store.mem.set(PERSIST_KEY, '{"version":1,"tables":{},"blobs":{}}')
    store.mem.set(PERSIST_BAK_KEY, '{"version":1,"tables":{},"blobs":{}}')
    await resetSharedApi({ wipeStorage: true })
    expect(store.mem.get(PERSIST_KEY)).toBeUndefined()
    expect(store.mem.get(PERSIST_BAK_KEY)).toBeUndefined()
  })

  it('equipment survives memory reset and re-bootstrap', async () => {
    const api1 = await getSharedApi()
    const db1 = api1.getDbForTests()
    const marker = `persist-test-${Date.now()}`
    db1.equipment.push({
      id: '00000000-0000-4000-8000-00000000eq01',
      name: marker,
      serialNo: 'SN-1',
      serialNorm: 'sn-1',
      invNo: 'INV-PERSIST',
      fgisEquipmentId: null,
      kind: EquipmentKind.si,
      isActive: true,
      deletedAt: null,
    })

    await flushPersistSharedDb()
    expect(store.mem.get(PERSIST_KEY)).toContain(marker)
    expect(store.mem.get(PERSIST_BAK_KEY)).toContain(marker)

    await resetSharedApi()
    expect(store.mem.get(PERSIST_KEY)).toContain(marker)
    expect(getDbRefForTests()).toBeNull()

    const api2 = await getSharedApi()
    const names = api2.getDbForTests().equipment.map((e) => e.name)
    expect(names).toContain(marker)
  })

  it('customers, fsa, settings survive re-bootstrap', async () => {
    const api = await getSharedApi()
    const db = api.getDbForTests()
    db.customers.push({
      id: '00000000-0000-4000-8000-00000000cu01',
      name: 'ООО Тест-Заказчик',
      nameAliases: [],
      kindId: CustomerKindId.legalEntity,
      inn: '7700000000',
      ogrn: null,
      phone: null,
      email: null,
      legalAddress: null,
      actualAddress: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    })
    db.fsaEntries.push({
      id: '00000000-0000-4000-8000-00000000fs01',
      catalog: 'indicators',
      name: 'Показатель тест',
      isActual: true,
    })
    expect(db.settings[0]).toBeTruthy()
    if (db.settings[0]) {
      db.settings[0] = { ...db.settings[0], value: 'persist-settings-marker' }
    }

    await flushPersistSharedDb()
    await resetSharedApi()

    const api2 = await getSharedApi()
    const db2 = api2.getDbForTests()
    expect(db2.customers.some((c) => c.name === 'ООО Тест-Заказчик')).toBe(true)
    expect(db2.fsaEntries.some((e) => e.name === 'Показатель тест')).toBe(true)
    expect(
      db2.settings.some((s) => s.value === 'persist-settings-marker'),
    ).toBe(true)
  })

  it('logout-like path keeps in-memory db (no resetSharedApi)', async () => {
    const api = await getSharedApi()
    const marker = 'logout-keep-memory'
    api.getDbForTests().equipment.push({
      id: '00000000-0000-4000-8000-00000000eq02',
      name: marker,
      serialNo: null,
      serialNorm: null,
      invNo: null,
      fgisEquipmentId: null,
      kind: EquipmentKind.aux,
      isActive: true,
      deletedAt: null,
    })
    await flushPersistSharedDb()

    expect(getDbRefForTests()).not.toBeNull()
    expect(
      getDbRefForTests()!.equipment.some((e) => e.name === marker),
    ).toBe(true)
  })

  it('persist failure is emitted (not swallowed)', async () => {
    const errors: Error[] = []
    const unsub = onPersistFailure((e) => errors.push(e))

    const failing: SnapshotStore = {
      async get() {
        return null
      },
      async set() {
        throw new Error('QuotaExceeded')
      },
      async remove() {
        /* noop */
      },
    }
    setSnapshotStoreForTests(failing)
    resetSnapshotStoreCache()

    await getSharedApi()
    await expect(flushPersistSharedDb()).rejects.toThrow(/QuotaExceeded/)
    expect(errors.some((e) => e.message.includes('QuotaExceeded'))).toBe(true)
    unsub()
  })

  it('corrupt primary falls back to bak and quarantines', async () => {
    const api = await getSharedApi()
    const marker = 'bak-recovery-marker'
    api.getDbForTests().equipment.push({
      id: '00000000-0000-4000-8000-00000000eq03',
      name: marker,
      serialNo: null,
      serialNorm: null,
      invNo: null,
      fgisEquipmentId: null,
      kind: EquipmentKind.si,
      isActive: true,
      deletedAt: null,
    })
    await flushPersistSharedDb()
    expect(store.mem.get(PERSIST_KEY)).toContain(marker)
    expect(store.mem.get(PERSIST_BAK_KEY)).toContain(marker)

    // Сброс памяти без повторной записи поверх испорченного primary
    await resetSharedApi()
    store.mem.set(PERSIST_KEY, '{not-json')

    const api2 = await getSharedApi()
    expect(
      api2.getDbForTests().equipment.some((e) => e.name === marker),
    ).toBe(true)
    expect(store.mem.get(PERSIST_QUARANTINE_KEY)).toBe('{not-json')
  })

  it('migrates legacy localStorage snapshot into store', async () => {
    const marker = 'legacy-ls-marker'
    const api = await getSharedApi()
    api.getDbForTests().equipment.push({
      id: '00000000-0000-4000-8000-00000000eq04',
      name: marker,
      serialNo: null,
      serialNorm: null,
      invNo: null,
      fgisEquipmentId: null,
      kind: EquipmentKind.test,
      isActive: true,
      deletedAt: null,
    })
    await flushPersistSharedDb()
    const raw = store.mem.get(PERSIST_KEY)!
    await resetSharedApi({ wipeStorage: true })
    store.mem.clear()

    const ls = new Map<string, string>()
    ls.set(PERSIST_KEY, raw)
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => {
        ls.set(k, v)
      },
      removeItem: (k: string) => {
        ls.delete(k)
      },
      clear: () => ls.clear(),
      key: (i: number) => [...ls.keys()][i] ?? null,
      length: 0,
    } satisfies Storage)

    const api2 = await getSharedApi()
    expect(
      api2.getDbForTests().equipment.some((e) => e.name === marker),
    ).toBe(true)
    expect(store.mem.get(PERSIST_KEY)).toContain(marker)
  })
})
