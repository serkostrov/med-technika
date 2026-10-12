import { describe, expect, it } from 'vitest'
import { OaEditionKind, ProtocolStatus } from '@/domain'
import { SeedIds } from '@/data/ids'
import {
  DictionaryService,
  normalizeCustomerName,
  normalizeSerial,
  parseFgisTaggedText,
  previewOaImport,
  previewEquipmentImport,
  previewStaffImport,
  previewUnitsImport,
  splitOaSegments,
} from '@/dictionaries'
import { createEmptyDatabase } from '@/server/db/database'
import { bootstrapServer, SeedCredentials } from '@/server'

describe('normalize', () => {
  it('нормализует имя заказчика и aliases (§7.1)', () => {
    expect(normalizeCustomerName('ООО "Эталон-Мед"')).toBe(
      normalizeCustomerName('ООО «Эталон-мед»'),
    )
  })

  it('нормализует серийный номер (§7.2)', () => {
    expect(normalizeSerial(' 08024 ')).toBe('08024')
    expect(normalizeSerial('ab 12')).toBe('AB12')
  })

  it('извлекает id из ||id N|| и null для «id отсутствует»', () => {
    expect(parseFgisTaggedText('ГОСТ ||id 36174||')).toEqual({
      text: 'ГОСТ',
      id: '36174',
      isAbsent: false,
    })
    expect(parseFgisTaggedText('Показатель ||id отсутствует||').id).toBeNull()
  })
})

describe('OA import', () => {
  it('распознаёт перезапуск нумерации и требует виды редакций', () => {
    const rows = [
      {
        пункт: '1.10.',
        методика: 'ГОСТ ||id отсутствует||',
        метод: 'Прочие ||id 1140||',
        'тип объекта': 'Продукция',
        показатель: 'Выходная мощность ||id 126477||',
        единица: 'Вт ||id 42||',
        диапазон: '1 - 10',
      },
      {
        пункт: '1.48.',
        методика: 'ГОСТ',
        метод: 'Прочие ||id 1140||',
        'тип объекта': 'Продукция',
        показатель: 'Сила тока ||id 215||',
        единица: 'мА ||id 716||',
        диапазон: '-',
      },
      // перезапуск
      {
        пункт: '1.1.',
        методика: 'МУК',
        метод: '—',
        'тип объекта': 'Продукция',
        показатель: 'Расширение ||id отсутствует||',
        единица: 'Вт ||id 42||',
        диапазон: '0 - 1',
      },
    ]
    const preview = previewOaImport(rows, 'oa.xlsx')
    expect(preview.segments.length).toBe(2)
    expect(preview.segments[0]!.suggestedKind).toBe(OaEditionKind.current)
    expect(preview.segments[1]!.suggestedKind).toBe(OaEditionKind.extension)
    expect(preview.canCommit).toBe(true)
    expect(preview.rowCount).toBe(3)
  })

  it('блокирует commit при пустых обязательных полях', () => {
    const preview = previewOaImport([
      { пункт: '', методика: '', показатель: 'X' },
    ])
    expect(preview.canCommit).toBe(false)
    expect(preview.issues.some((i) => i.code === 'REQUIRED')).toBe(true)
  })

  it('повторный импорт деактивирует старую редакцию и сохраняет старые ссылки', () => {
    const db = createEmptyDatabase()
    const audits: string[] = []
    const svc = new DictionaryService(db, (_e, _id, action) => {
      audits.push(action)
    })

    const oldItemId = SeedIds.oaItemUhfPower
    db.protocols.push({
      id: 'proto-1',
      number: '1-26-УВЧ',
      protocolDate: '2026-09-22',
      measureStart: null,
      measureEnd: null,
      modelGetDate: null,
      applicationDate: null,
      formId: SeedIds.formUhf,
      customerId: null,
      raw: {},
      objectFullName: null,
      measurePlace: null,
      measureAddress: null,
      territoryFeature: null,
      customerPhone: null,
      conditions: null,
      engineerStaffId: null,
      accredScope353: false,
      status: ProtocolStatus.review,
      sourcePath: 'x',
      sourceSha256: 'y',
      parserVersion: null,
      scanPath: null,
      uploadedBy: null,
      uploadedAt: '2026-10-05T00:00:00.000Z',
      approvedBy: null,
      approvedAt: null,
      deletedAt: null,
    })
    db.protocolResults.push({
      id: 'r1',
      protocolId: 'proto-1',
      objectId: null,
      seq: 1,
      sourceKey: 'мощность',
      indicatorRaw: null,
      unitSymbol: 'Вт',
      setValue: null,
      rawValues: null,
      avgExcel: null,
      uExcel: null,
      avgCalc: null,
      uCalc: null,
      numberFormat: null,
      displayExcel: null,
      factValue: '1',
      oaItemId: oldItemId,
      includeInXml: true,
    })

    const preview = previewOaImport(
      [
        {
          пункт: '1.10.',
          методика: 'ГОСТ',
          метод: 'Прочие ||id 1140||',
          'тип объекта': 'Продукция',
          показатель: 'Выходная мощность ||id 126477||',
          единица: 'Вт ||id 42||',
          диапазон: '1 - 100',
        },
      ],
      'oa-v2.xlsx',
    )
    const result = svc.commitOaImport(preview, [OaEditionKind.current])
    expect(result.itemCount).toBe(1)

    const oldEdition = db.oaEditions.find((e) => e.id === SeedIds.oaEditionCurrent)
    expect(oldEdition?.isActive).toBe(false)
    expect(db.protocolResults[0]!.oaItemId).toBe(oldItemId)
    expect(db.oaItems.some((i) => i.id === oldItemId)).toBe(true)
    expect(audits).toContain('deactivate')
    expect(audits).toContain('import')
  })
})

describe('other imports', () => {
  it('ловят дубликаты EquipmentId и idFullName', () => {
    const eq = previewEquipmentImport([
      {
        Наименование: 'A',
        'зав. №': '08024',
        EquipmentId: '100',
      },
      {
        Наименование: 'B',
        'зав. №': '08025',
        EquipmentId: '100',
      },
    ])
    expect(eq.canCommit).toBe(false)
    expect(eq.issues.some((i) => i.code === 'DUPLICATE')).toBe(true)

    const staff = previewStaffImport([
      { Фамилия: 'Иванов', idFullName: '1' },
      { Фамилия: 'Петров', idFullName: '1' },
    ])
    expect(staff.canCommit).toBe(false)
  })

  it('импорт единиц с конфликтом обозначения', () => {
    const preview = previewUnitsImport([
      { ID: '42', наименование: 'ватт', обозначение: 'Вт' },
      { ID: '43', наименование: 'другое', обозначение: 'Вт' },
    ])
    expect(preview.canCommit).toBe(true) // conflict = warning
    expect(preview.issues.some((i) => i.code === 'CONFLICT')).toBe(true)
  })

  it('заказчик: aliases через нормализацию имени', () => {
    const db = createEmptyDatabase()
    const svc = new DictionaryService(db, () => undefined)
    const a = svc.upsertCustomer({
      name: 'ООО "Эталон-Мед"',
      inn: '1215207448',
      ogrn: '1161215050699',
    })
    const b = svc.upsertCustomer({ name: 'ООО «Эталон-мед»' })
    expect(b.id).toBe(a.id)
    expect(a.inn).toBe('1215207448')
    const withAlias = svc.addCustomerAlias(a.id, 'Эталон Мед')
    expect(withAlias.nameAliases.length).toBeGreaterThan(0)
  })

  it('поверка и пересчёт единиц пишутся в audit', () => {
    const db = createEmptyDatabase()
    const actions: string[] = []
    const svc = new DictionaryService(db, (_e, _id, action) => actions.push(action))
    const eqPreview = previewEquipmentImport([
      { Наименование: 'СИ', 'зав. №': '1', EquipmentId: '1754553', вид: 'СИ' },
    ])
    svc.commitEquipmentImport(eqPreview)
    const eqId = db.equipment[0]!.id
    svc.addVerification({
      equipmentId: eqId,
      certNo: 'С-1',
      verifiedOn: '2025-01-01',
      validUntil: '2026-12-31',
    })
    svc.upsertUnitConversion({ fromSymbol: 'кГц', toSymbol: 'Гц', factor: 1000 })
    expect(actions).toContain('create')
    expect(db.equipmentVerifications).toHaveLength(1)
    expect(normalizeSerial(db.equipment[0]!.serialNo!)).toBe(
      db.equipment[0]!.serialNorm,
    )
  })
})

describe('API ACL for dictionaries', () => {
  it('engineer не может commit импорта ОА', async () => {
    const { api } = await bootstrapServer()
    const login = await api.login(
      SeedCredentials.engineer.email,
      SeedCredentials.engineer.password,
    )
    const ctx = api.auth.resolveToken(login.token)
    expect(() =>
      api.previewOaImport(ctx, [{ пункт: '1.1.', методика: 'x', показатель: 'y' }], null),
    ).toThrow(/начальник|прав/i)
  })
})

describe('splitOaSegments', () => {
  it('не дробит монотонную нумерацию', () => {
    const segments = splitOaSegments([
      {
        row: 2,
        itemNo: '1.1.',
        methodikText: 'a',
        methodikFgisId: null,
        methodText: null,
        methodFgisId: null,
        objectType: null,
        indicatorText: 'i',
        indicatorFgisId: null,
        unitText: null,
        unitFgisId: null,
        rangeText: null,
        rangeMin: null,
        rangeMax: null,
        isCalculated: false,
        objectName: null,
      },
      {
        row: 3,
        itemNo: '1.2.',
        methodikText: 'a',
        methodikFgisId: null,
        methodText: null,
        methodFgisId: null,
        objectType: null,
        indicatorText: 'i2',
        indicatorFgisId: null,
        unitText: null,
        unitFgisId: null,
        rangeText: null,
        rangeMin: null,
        rangeMax: null,
        isCalculated: false,
        objectName: null,
      },
    ])
    expect(segments).toHaveLength(1)
  })
})
