import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EquipmentKind } from '@/domain'

/**
 * Контракт персиста portable SPA:
 * - справочники/оборудование живут в localStorage (`mt.db.v1`)
 * - logout (resetSharedApi без wipe) не стирает снимок
 * - повторный bootstrap восстанавливает изменения
 */

describe('shared-api persist contract', () => {
  const mem = new Map<string, string>()
  const fakeStorage: Storage = {
    get length() {
      return mem.size
    },
    clear: () => mem.clear(),
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, v)
    },
    removeItem: (k) => {
      mem.delete(k)
    },
    key: (i) => [...mem.keys()][i] ?? null,
  }

  beforeEach(() => {
    mem.clear()
    vi.stubGlobal('localStorage', fakeStorage)
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } satisfies Storage)
  })

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('resetSharedApi without wipe keeps localStorage snapshot', async () => {
    mem.set('mt.db.v1', '{"version":1,"tables":{},"blobs":{}}')
    const { resetSharedApi } = await import('@/client/shared-api')
    resetSharedApi()
    expect(mem.get('mt.db.v1')).toBeTruthy()
  })

  it('resetSharedApi({ wipeStorage: true }) clears snapshot', async () => {
    mem.set('mt.db.v1', '{"version":1,"tables":{},"blobs":{}}')
    const { resetSharedApi } = await import('@/client/shared-api')
    resetSharedApi({ wipeStorage: true })
    expect(mem.get('mt.db.v1')).toBeUndefined()
  })

  it('equipment survives logout-like reset and re-bootstrap', async () => {
    const {
      getSharedApi,
      flushPersistSharedDb,
      resetSharedApi,
    } = await import('@/client/shared-api')

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

    flushPersistSharedDb()
    expect(mem.get('mt.db.v1')).toContain(marker)

    // Имитация logout: память сброшена, localStorage сохранён
    resetSharedApi()
    expect(mem.get('mt.db.v1')).toContain(marker)

    const api2 = await getSharedApi()
    const names = api2.getDbForTests().equipment.map((e) => e.name)
    expect(names).toContain(marker)
  })
})
