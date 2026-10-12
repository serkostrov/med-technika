import { describe, expect, it } from 'vitest'
import {
  CustomerKindId,
  EquipmentKind,
  IssueSeverity,
  OaEditionKind,
  ProtocolStatus,
  type Customer,
  type Equipment,
  type EquipmentVerification,
  type Protocol,
  type ProtocolEquipment,
  type ProtocolObject,
  type ProtocolResult,
} from '@/domain'
import { SeedIds } from '@/data/ids'
import { createEmptyDatabase, type Database } from '@/server/db/database'
import {
  FACT_VALUE_CASES,
  applyIndicatorMapsToProtocol,
  computeFactValue,
  confirmIndicatorMapping,
  formatFactValue,
  matchCustomerByName,
  matchEngineer,
  matchEquipment,
  matchIndicator,
  matchUnit,
  protocolRunChecks,
  recalcMeanAndU,
  setSeverityOverride,
} from '@/validation'

function baseProtocol(db: Database, overrides: Partial<Protocol> = {}): Protocol {
  const customer = ensureCustomer(db)
  const eq = ensureEquipment(db)
  ensureVerification(db, eq.id)

  const protocol: Protocol = {
    id: crypto.randomUUID(),
    number: '99-26-ТСТ',
    protocolDate: '2026-09-22',
    measureStart: '2026-09-20',
    measureEnd: '2026-09-21',
    modelGetDate: '2026-09-20',
    applicationDate: '2026-09-19',
    formId: SeedIds.formUhf,
    customerId: customer.id,
    raw: {},
    objectFullName: 'Аппарат УВЧ тестовый',
    measurePlace: 'Кабинет',
    measureAddress: 'пер. Искожевский, 16',
    territoryFeature: null,
    customerPhone: '+7 900 000-00-00',
    conditions: { t: 22, rh: 40, p: 100, voltages: [{ start: 220, end: 220 }] },
    engineerStaffId: SeedIds.staffSudnitsyn,
    accredScope353: false,
    status: ProtocolStatus.review,
    sourcePath: 'test.xlsx',
    sourceSha256: 'a'.repeat(64),
    parserVersion: 'test',
    scanPath: null,
    uploadedBy: SeedIds.staffSudnitsyn,
    uploadedAt: '2026-09-22T10:00:00.000Z',
    approvedBy: null,
    approvedAt: null,
    deletedAt: null,
    ...overrides,
  }
  // status is readonly on type but we assign via spread for tests
  Object.assign(protocol, { status: overrides.status ?? ProtocolStatus.review })
  db.protocols.push(protocol)

  const obj: ProtocolObject = {
    id: crypto.randomUUID(),
    protocolId: protocol.id,
    seq: 1,
    name: 'Объект',
    serialNo: 'SN-1',
    year: '2020',
    department: null,
  }
  db.protocolObjects.push(obj)

  const result: ProtocolResult = {
    id: crypto.randomUUID(),
    protocolId: protocol.id,
    objectId: obj.id,
    seq: 1,
    sourceKey: 'выходная мощность, вт',
    indicatorRaw: 'Выходная мощность',
    unitSymbol: 'Вт',
    setValue: null,
    rawValues: [60, 62, 64, 66],
    avgExcel: 63,
    uExcel: 5,
    avgCalc: null,
    uCalc: null,
    numberFormat: '0.0',
    displayExcel: 63,
    factValue: '63,0',
    oaItemId: SeedIds.oaItemUhfPower,
    includeInXml: true,
  }
  db.protocolResults.push(result)

  const pe: ProtocolEquipment = {
    protocolId: protocol.id,
    seq: 1,
    equipmentId: eq.id,
    rawText: eq.name,
    serialRaw: eq.serialNo,
    certRaw: 'С-001',
    validUntilRaw: '2027-01-01',
    kind: EquipmentKind.si,
  }
  db.protocolEquipment.push(pe)

  return protocol
}

function ensureCustomer(db: Database): Customer {
  let c = db.customers[0]
  if (!c) {
    c = {
      id: crypto.randomUUID(),
      name: 'ООО Тест',
      nameAliases: [],
      kindId: CustomerKindId.legalEntity,
      inn: '7707083893',
      ogrn: '1027700132195',
      phone: '+7 495 000-00-00',
      email: 'a@b.ru',
      legalAddress: 'Москва',
      actualAddress: 'Москва',
      createdAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    }
    db.customers.push(c)
  }
  return c
}

function ensureEquipment(db: Database): Equipment {
  let e = db.equipment[0]
  if (!e) {
    e = {
      id: crypto.randomUUID(),
      name: 'Измеритель мощности',
      serialNo: 'EQ-001',
      serialNorm: 'EQ-001',
      invNo: null,
      fgisEquipmentId: 12345,
      kind: EquipmentKind.si,
      isActive: true,
      deletedAt: null,
    }
    db.equipment.push(e)
  }
  return e
}

function ensureVerification(db: Database, equipmentId: string): EquipmentVerification {
  let v = db.equipmentVerifications.find((x) => x.equipmentId === equipmentId)
  if (!v) {
    v = {
      id: crypto.randomUUID(),
      equipmentId,
      certNo: 'С-001',
      verifiedOn: '2025-01-01',
      validUntil: '2027-01-01',
      createdAt: '2025-01-01T00:00:00.000Z',
      deletedAt: null,
    }
    db.equipmentVerifications.push(v)
  }
  return v
}

function hasCode(db: Database, protocolId: string, code: string): boolean {
  return db.protocolIssues.some(
    (i) => i.protocolId === protocolId && i.isActive && i.code === code,
  )
}

describe('FactValue (§6.6) — 10 кейсов ТЗ', () => {
  it.each(FACT_VALUE_CASES)(
    '$value / $format → $expected',
    ({ value, format, expected }) => {
      expect(formatFactValue(value, format)).toBe(expected)
      expect(
        computeFactValue({ value, numberFormat: format }),
      ).toBe(expected)
    },
  )

  it('не использует ServerRecalc — только display Excel', () => {
    const display = computeFactValue({ value: 63.27, numberFormat: '0.0' })
    const fromRecalc = formatFactValue(999, '0.0')
    expect(display).toBe('63,3')
    expect(fromRecalc).not.toBe(display)
  })
})

describe('Recalc (§6.5)', () => {
  it('считает avg, uA, uB, u, U', () => {
    const r = recalcMeanAndU([10, 12, 14, 16], { type: 'rel', value: 0.1 })
    expect(r.avg).toBe(13)
    expect(r.uA).toBeCloseTo(Math.sqrt(20 / 3 / 4), 10)
    expect(r.uB).toBeCloseTo((13 * 0.1) / Math.sqrt(3), 10)
    expect(r.u).toBeCloseTo(Math.sqrt(r.uA ** 2 + r.uB ** 2), 10)
    expect(r.U).toBeCloseTo(2 * r.u, 10)
  })

  it('хранит Excel и calc отдельно (W02 при расхождении)', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    const result = db.protocolResults.find((r) => r.protocolId === p.id)!
    result.avgExcel = 100
    result.uExcel = 100
    protocolRunChecks(db, p.id)
    expect(result.avgCalc).not.toBeNull()
    expect(result.avgCalc).not.toBe(result.avgExcel)
    expect(hasCode(db, p.id, 'W02')).toBe(true)
  })
})

describe('Matching', () => {
  it('заказчик по имени и алиасу', () => {
    const db = createEmptyDatabase()
    const c = ensureCustomer(db)
    c.nameAliases = ['Тест Алиас']
    expect(matchCustomerByName(db.customers, 'ООО Тест')?.id).toBe(c.id)
    expect(matchCustomerByName(db.customers, 'Тест Алиас')?.id).toBe(c.id)
  })

  it('СИ по серийному номеру', () => {
    const db = createEmptyDatabase()
    expect(db.equipment).toHaveLength(0)
    const e = ensureEquipment(db)
    expect(e.serialNorm).toBe('EQ-001')
    expect(db.equipment).toHaveLength(1)
    const found = matchEquipment(db.equipment, 'EQ-001', 'Измеритель мощности')
    expect(found?.id).toBe(e.id)
  })

  it('исполнитель по фамилии', () => {
    const db = createEmptyDatabase()
    expect(matchEngineer(db.staff, 'Судницын А.В.')?.id).toBe(
      SeedIds.staffSudnitsyn,
    )
  })

  it('показатель → ОА через form_indicator_map', () => {
    const db = createEmptyDatabase()
    const m = matchIndicator(
      db.formIndicatorMaps,
      SeedIds.formUhf,
      'выходная мощность, вт',
      db.oaItems,
    )
    expect(m.auto).toBe(true)
    expect(m.oaItem?.id).toBe(SeedIds.oaItemUhfPower)
  })

  it('единица → ОА через convert', () => {
    const db = createEmptyDatabase()
    const m = matchUnit(db.units, db.unitConversions, 'МГц', 'Гц', 27.12)
    expect(m.convertible).toBe(true)
    expect(m.convertedValue).toBeCloseTo(27.12e6, 0)
  })

  it('обучаемое сопоставление сохраняется и применяется', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    const result = db.protocolResults.find((r) => r.protocolId === p.id)!
    result.sourceKey = 'новый показатель'
    result.oaItemId = null

    confirmIndicatorMapping(db, {
      formId: SeedIds.formUhf,
      sourceKey: 'новый показатель',
      oaItemId: SeedIds.oaItemUhfPower,
      ub: { type: 'rel', value: 0.1 },
    })
    applyIndicatorMapsToProtocol(db, p.id)
    expect(result.oaItemId).toBe(SeedIds.oaItemUhfPower)

    const p2 = baseProtocol(db, { number: '100-26-ТСТ' })
    const r2 = db.protocolResults.find((r) => r.protocolId === p2.id)!
    r2.sourceKey = 'новый показатель'
    r2.oaItemId = null
    applyIndicatorMapsToProtocol(db, p2.id)
    expect(r2.oaItemId).toBe(SeedIds.oaItemUhfPower)
  })
})

describe('protocol_run_checks E01–E15', () => {
  it('E01: пустые обязательные поля', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db, {
      number: '',
      objectFullName: null,
      measureAddress: null,
      customerId: null,
      engineerStaffId: null,
      measureStart: null,
      measureEnd: null,
    })
    db.protocolResults = db.protocolResults.filter((r) => r.protocolId !== p.id)
    db.protocolEquipment = db.protocolEquipment.filter(
      (e) => e.protocolId !== p.id,
    )
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E01')).toBe(true)
  })

  it('E02: FactValue вне диапазона ОА', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    const oa = db.oaItems.find((i) => i.id === SeedIds.oaItemUhfPower)!
    oa.rangeMin = 0
    oa.rangeMax = 10
    oa.rangeText = '0 - 10'
    const result = db.protocolResults.find((r) => r.protocolId === p.id)!
    result.factValue = '63,0'
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E02')).toBe(true)
  })

  it('E03: результат не сопоставлен с ОА', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    db.protocolResults.find((r) => r.protocolId === p.id)!.oaItemId = null
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E03')).toBe(true)
  })

  it('E04: нет EquipmentId', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    const eq = ensureEquipment(db)
    eq.fgisEquipmentId = null
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E04')).toBe(true)
  })

  it('E05: поверка СИ не действует', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    const eq = ensureEquipment(db)
    for (const v of db.equipmentVerifications.filter(
      (x) => x.equipmentId === eq.id,
    )) {
      v.validUntil = '2020-01-01'
    }
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E05')).toBe(true)
  })

  it('E06: исполнитель без idFullName', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    const staff = db.staff.find((s) => s.id === SeedIds.staffSudnitsyn)!
    staff.fgisIdFullName = null
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E06')).toBe(true)
  })

  it('E07: даты измерений позже протокола', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db, {
      protocolDate: '2026-09-01',
      measureStart: '2026-09-20',
      measureEnd: '2026-09-21',
    })
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E07')).toBe(true)
  })

  it('E08: окончание раньше начала', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db, {
      measureStart: '2026-09-21',
      measureEnd: '2026-09-20',
    })
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E08')).toBe(true)
  })

  it('E09: дата заявки позже протокола', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db, {
      protocolDate: '2026-09-22',
      applicationDate: '2026-09-25',
    })
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E09')).toBe(true)
  })

  it('E10: повтор номера + даты', () => {
    const db = createEmptyDatabase()
    baseProtocol(db, { number: 'DUP-1', protocolDate: '2026-09-22' })
    const p2 = baseProtocol(db, {
      number: 'DUP-1',
      protocolDate: '2026-09-22',
    })
    protocolRunChecks(db, p2.id)
    expect(hasCode(db, p2.id, 'E10')).toBe(true)
  })

  it('E11: дата протокола в будущем', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db, { protocolDate: '2099-01-01' })
    protocolRunChecks(db, p.id, { now: '2026-10-05T12:00:00.000Z' })
    expect(hasCode(db, p.id, 'E11')).toBe(true)
  })

  it('E12: расширяемая ОА без AccredScope353', () => {
    const db = createEmptyDatabase()
    const extId = crypto.randomUUID()
    db.oaEditions.push({
      id: extId,
      title: 'Расширяемая',
      kind: OaEditionKind.extension,
      isActive: true,
      sourceFile: null,
      loadedAt: '2026-01-01T00:00:00.000Z',
    })
    const p = baseProtocol(db, { accredScope353: false })
    const oa = db.oaItems.find((i) => i.id === SeedIds.oaItemUhfPower)!
    oa.editionId = extId
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E12')).toBe(true)
  })

  it('E13: нет ИНН и ОГРН у ЮЛ', () => {
    const db = createEmptyDatabase()
    const c = ensureCustomer(db)
    c.inn = null
    c.ogrn = null
    const p = baseProtocol(db)
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E13')).toBe(true)
  })

  it('E14: нет контакта заказчика', () => {
    const db = createEmptyDatabase()
    const c = ensureCustomer(db)
    c.phone = null
    c.email = null
    c.legalAddress = null
    c.actualAddress = null
    const p = baseProtocol(db, { customerPhone: null })
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E14')).toBe(true)
  })

  it('E15: нет пересчёта единицы', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    const result = db.protocolResults.find((r) => r.protocolId === p.id)!
    result.unitSymbol = 'Вт'
    const oa = db.oaItems.find((i) => i.id === SeedIds.oaItemUhfPower)!
    oa.unitText = 'кПа'
    // Вт → кПа нет в seed
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'E15')).toBe(true)
  })
})

describe('protocol_run_checks W01–W07 (без W04 в ТЗ)', () => {
  it('W01: условия вне пределов', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db, {
      conditions: { t: 5, rh: 40, p: 100 },
    })
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'W01')).toBe(true)
  })

  it('W02: расхождение пересчёта', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    const result = db.protocolResults.find((r) => r.protocolId === p.id)!
    result.avgExcel = 1
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'W02')).toBe(true)
  })

  it('W03: свидетельство не совпадает', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    const pe = db.protocolEquipment.find((e) => e.protocolId === p.id)!
    pe.certRaw = 'ДРУГОЕ'
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'W03')).toBe(true)
  })

  it('W05: несколько пар напряжения', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db, {
      conditions: {
        t: 22,
        rh: 40,
        p: 100,
        voltages: [
          { start: 220, end: 220 },
          { start: 230, end: 230 },
        ],
      },
    })
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'W05')).toBe(true)
  })

  it('W06: нет года выпуска', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    db.protocolObjects.find((o) => o.protocolId === p.id)!.year = null
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'W06')).toBe(true)
  })

  it('W07: диапазон ОА не распознан', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    const oa = db.oaItems.find((i) => i.id === SeedIds.oaItemUhfPower)!
    oa.rangeText = 'от 0 до 100'
    oa.rangeMin = null
    oa.rangeMax = null
    protocolRunChecks(db, p.id)
    expect(hasCode(db, p.id, 'W07')).toBe(true)
  })
})

describe('Жизненный цикл замечаний и overrides', () => {
  it('повторный прогон деактивирует старые, не удаляет', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db)
    db.protocolResults.find((r) => r.protocolId === p.id)!.oaItemId = null
    protocolRunChecks(db, p.id)
    const first = db.protocolIssues.filter((i) => i.protocolId === p.id)
    expect(first.some((i) => i.isActive && i.code === 'E03')).toBe(true)

    db.protocolResults.find((r) => r.protocolId === p.id)!.oaItemId =
      SeedIds.oaItemUhfPower
    protocolRunChecks(db, p.id)
    expect(first.every((i) => !i.isActive || i.protocolId !== p.id || true)).toBe(
      true,
    )
    expect(db.protocolIssues.filter((i) => i.protocolId === p.id).length).toBeGreaterThan(
      first.filter((i) => i.code === 'E03').length,
    )
    expect(
      db.protocolIssues.some(
        (i) => i.protocolId === p.id && i.code === 'E03' && !i.isActive,
      ),
    ).toBe(true)
    expect(hasCode(db, p.id, 'E03')).toBe(false)
  })

  it('severity_overrides меняет уровень', () => {
    const db = createEmptyDatabase()
    setSeverityOverride(db, 'W01', IssueSeverity.error)
    const p = baseProtocol(db, {
      conditions: { t: 5, rh: 40, p: 100 },
    })
    protocolRunChecks(db, p.id)
    const issue = db.protocolIssues.find(
      (i) => i.protocolId === p.id && i.isActive && i.code === 'W01',
    )
    expect(issue?.severity).toBe(IssueSeverity.error)
  })

  it('повторный прогон сохраняет «к сведению» для совпадающего warning', () => {
    const db = createEmptyDatabase()
    const p = baseProtocol(db, {
      conditions: { t: 5, rh: 40, p: 100 },
    })
    protocolRunChecks(db, p.id)
    const first = db.protocolIssues.find(
      (i) => i.protocolId === p.id && i.isActive && i.code === 'W01',
    )
    expect(first).toBeTruthy()
    first!.acknowledgedBy = SeedIds.staffSadakov
    first!.acknowledgedAt = '2026-09-22T12:00:00.000Z'
    first!.ackComment = 'ок'

    protocolRunChecks(db, p.id)
    const again = db.protocolIssues.find(
      (i) => i.protocolId === p.id && i.isActive && i.code === 'W01',
    )
    expect(again?.id).not.toBe(first!.id)
    expect(again?.acknowledgedAt).toBe('2026-09-22T12:00:00.000Z')
    expect(again?.ackComment).toBe('ок')
    expect(again?.acknowledgedBy).toBe(SeedIds.staffSadakov)
  })
})
