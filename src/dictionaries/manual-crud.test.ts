import { beforeEach, describe, expect, it } from 'vitest'
import { OaEditionKind } from '@/domain'
import { SeedCredentials, bootstrapServer, type SecureApi } from '@/server'
import type { AuthContext } from '@/security'

async function asHead(api: SecureApi): Promise<AuthContext> {
  const login = await api.login(
    SeedCredentials.head.email,
    SeedCredentials.head.password,
  )
  return api.auth.resolveToken(login.token)
}

describe('ручной CRUD справочников', () => {
  let api: SecureApi
  let head: AuthContext

  beforeEach(async () => {
    ;({ api } = await bootstrapServer())
    head = await asHead(api)
  })

  it('staff: create → update → soft-delete', () => {
    const created = api.createStaff(head, {
      fullName: 'Тестов Тест Тестович',
      fgisIdFullName: 999001,
      appRole: 'engineer',
    })
    expect(created.id).toBeTruthy()
    expect(created.shortName).toBe('Тестов Т.Т.')
    expect(created.surname).toBe('Тестов')
    const updated = api.updateStaff(head, created.id, {
      fullName: 'Тестов Тимофей',
    })
    expect(updated.shortName).toBe('Тестов Т.')
    api.deleteStaff(head, created.id)
    const snap = api.getDictionarySnapshot(head)
    expect(snap.staff.find((s) => s.id === created.id)).toBeUndefined()
  })

  it('equipment + verification: create → update → delete', () => {
    const eq = api.createEquipment(head, {
      name: 'Мультиметр тест',
      kind: 'si',
      serialNo: 'SN-CRUD-1',
      fgisEquipmentId: 12345,
    })
    const ver = api.addEquipmentVerification(head, {
      equipmentId: eq.id,
      certNo: 'С-1',
      validUntil: '2027-01-01',
      verifiedOn: '2026-01-01',
    })
    expect(ver.certNo).toBe('С-1')
    const updated = api.updateEquipmentVerification(head, ver.id, {
      certNo: 'С-2',
      validUntil: '2028-06-01',
      verifiedOn: '2026-02-01',
    })
    expect(updated.certNo).toBe('С-2')
    expect(updated.validUntil).toBe('2028-06-01')
    api.deleteEquipmentVerification(head, ver.id)
    api.deleteEquipment(head, eq.id)
    const snap = api.getDictionarySnapshot(head)
    expect(snap.equipment.find((e) => e.id === eq.id)).toBeUndefined()
    expect(
      snap.equipmentVerifications.find((v) => v.id === ver.id),
    ).toBeUndefined()
  })

  it('units + conversions: upsert → delete', () => {
    api.upsertUnit(head, { fgisId: 'u-test', symbol: 'кВт', name: 'киловатт' })
    api.upsertUnitConversion(head, {
      fromSymbol: 'кВт',
      toSymbol: 'Вт',
      factor: 1000,
    })
    let snap = api.getDictionarySnapshot(head)
    expect(snap.units.some((u) => u.fgisId === 'u-test')).toBe(true)
    expect(
      snap.unitConversions.some(
        (c) => c.fromSymbol === 'кВт' && c.toSymbol === 'Вт',
      ),
    ).toBe(true)
    api.deleteUnitConversion(head, 'кВт', 'Вт')
    api.deleteUnit(head, 'u-test')
    snap = api.getDictionarySnapshot(head)
    expect(snap.units.some((u) => u.fgisId === 'u-test')).toBe(false)
    expect(
      snap.unitConversions.some(
        (c) => c.fromSymbol === 'кВт' && c.toSymbol === 'Вт',
      ),
    ).toBe(false)
  })

  it('customers: create → update → soft-delete', () => {
    const created = api.createCustomer(head, {
      name: 'ООО Тест Заказчик',
      nameAliases: ['Тест Заказчик'],
      inn: '1215207448',
      phone: '+78362380322',
      email: 'test@example.com',
    })
    expect(created.id).toBeTruthy()
    expect(created.name).toBe('ООО Тест Заказчик')
    expect(created.nameAliases).toEqual(['Тест Заказчик'])
    const updated = api.updateCustomer(head, created.id, {
      name: 'ООО Тест Заказчик Обновлён',
      inn: '7707083893',
    })
    expect(updated.name).toBe('ООО Тест Заказчик Обновлён')
    expect(updated.inn).toBe('7707083893')
    api.deleteCustomer(head, created.id)
    const snap = api.getDictionarySnapshot(head)
    expect(snap.customers.find((c) => c.id === created.id)).toBeUndefined()
  })

  it('OA edition + item: create → update → delete/deactivate', () => {
    const edition = api.createOaEdition(head, {
      title: 'Тестовая ОА',
      kind: OaEditionKind.current,
      isActive: true,
    })
    const item = api.createOaItem(head, {
      editionId: edition.id,
      itemNo: '9.9.9',
      methodikText: 'Методика тест',
      indicatorText: 'Показатель тест',
      unitText: 'Вт',
    })
    const updated = api.updateOaItem(head, item.id, {
      indicatorText: 'Показатель 2',
    })
    expect(updated.indicatorText).toBe('Показатель 2')
    api.deleteOaItem(head, item.id)
    api.deleteOaEdition(head, edition.id)
    const snap = api.getDictionarySnapshot(head)
    expect(snap.oaItems.find((i) => i.id === item.id)).toBeUndefined()
    const ed = snap.oaEditions.find((e) => e.id === edition.id)
    expect(ed?.isActive).toBe(false)
  })
})
