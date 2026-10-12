import { describe, expect, it } from 'vitest'
import {
  OaEditionKind,
  ProtocolStatus,
  RPC_COVERAGE,
  RpcOperation,
  checkDomainIntegrity,
  oaLinksSurviveDeactivation,
  type Protocol,
} from '@/domain'
import { createSeedBundle } from '@/data/seed'
import { createAppStore } from '@/data/store/memory-store'
import { SeedIds } from '@/data/ids'

describe('Domain integrity & seed', () => {
  it('seed проходит проверку целостности', () => {
    const store = createAppStore()
    expect(store.integrityViolations).toEqual([])
  })

  it('уникальность form_indicator_map и стабильные связи ОА', () => {
    const seed = createSeedBundle()
    const keys = seed.formIndicatorMaps.map((m) => `${m.formId}::${m.sourceKey}`)
    expect(new Set(keys).size).toBe(keys.length)
    for (const map of seed.formIndicatorMaps) {
      expect(seed.protocolForms.some((f) => f.id === map.formId)).toBe(true)
      expect(seed.oaItems.some((i) => i.id === map.oaItemId)).toBe(true)
    }
  })

  it('деактивация редакции ОА не ломает старые ссылки', () => {
    const seed = createSeedBundle()
    const editions = seed.oaEditions.map((e) =>
      e.id === SeedIds.oaEditionCurrent ? { ...e, isActive: false } : e,
    )
    const resultOaIds = seed.formIndicatorMaps.map((m) => m.oaItemId)
    expect(oaLinksSurviveDeactivation(editions, seed.oaItems, resultOaIds)).toBe(
      true,
    )

    // новая редакция может появиться параллельно
    const withNew = [
      ...editions,
      {
        id: '22222222-2222-4222-8222-222222222299',
        title: 'Новая действующая',
        kind: OaEditionKind.current,
        isActive: true,
        sourceFile: 'oa.xlsx',
        loadedAt: '2026-10-05T00:00:00.000Z',
      },
    ]
    expect(oaLinksSurviveDeactivation(withNew, seed.oaItems, resultOaIds)).toBe(
      true,
    )
  })

  it('ловит дубликат номер+дата у активных протоколов', () => {
    const seed = createSeedBundle()
    const p: Protocol = {
      id: 'p-a',
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
      sourcePath: 'a',
      sourceSha256: '1',
      parserVersion: null,
      scanPath: null,
      uploadedBy: null,
      uploadedAt: '2026-10-05T00:00:00.000Z',
      approvedBy: null,
      approvedAt: null,
      deletedAt: null,
    }
    const violations = checkDomainIntegrity({
      oaEditions: seed.oaEditions,
      oaItems: seed.oaItems,
      units: seed.units,
      unitConversions: seed.unitConversions,
      equipment: [],
      equipmentVerifications: [],
      protocolForms: seed.protocolForms,
      formIndicatorMaps: seed.formIndicatorMaps,
      protocols: [p, { ...p, id: 'p-b', sourceSha256: '2' }],
      protocolObjects: [],
      protocolResults: [],
      protocolEquipment: [],
      protocolIssues: [],
      fgisExports: [],
      fgisExportItems: [],
    })
    expect(violations.some((v) => v.code === 'PROTOCOL_NUM_DATE_UQ')).toBe(true)
  })

  it('каталог RPC из ТЗ §14 полностью перечислен', () => {
    const ops = new Set(RPC_COVERAGE.map((c) => c.operation))
    for (const op of Object.values(RpcOperation)) {
      expect(ops.has(op)).toBe(true)
    }
    expect(RPC_COVERAGE.length).toBe(Object.keys(RpcOperation).length)
  })

  it('ready-формы — только три эталонных из ТЗ', () => {
    const seed = createSeedBundle()
    const ready = seed.protocolForms.filter((f) => f.status === 'ready')
    expect(ready.map((f) => f.sheetName).sort()).toEqual([
      'Дефибриллятор ИЭВИ',
      'НЧ-терапия',
      'УВЧ-терапия',
    ])
  })
})
