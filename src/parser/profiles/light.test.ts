import { describe, expect, it } from 'vitest'
import { createSeedBundle } from '@/data/seed'
import { parseProtocol } from '@/parser'
import {
  KORSHUNOV,
  RADUGA_MED,
  buildRealProtocolXml,
  normalizeForCompare,
  realReferenceXml,
  realXlsx,
} from '@/parser/fixtures/real-reference.test-utils'

const E = ['865', '774', '1154', '763', '1144', '1080', '708', '626']

// разбор реального xlsx + bootstrap сервера — дольше 5 с при параллельном прогоне
describe('26-О освещённость (ГОСТ 24940-2016) — боевой 150-26-О', { timeout: 30_000 }, () => {
  it('разбор: 8 видимых точек × (Е, КП); скрытые точки 9–12 пропущены', () => {
    const seed = createSeedBundle()
    const parsed = parseProtocol({
      data: realXlsx('150-26-О'),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.parserProfile).toBe('light')
    expect(parsed.metadata.number).toBe('150-26-О')
    expect(parsed.metadata.conditions).toMatchObject({ t: 23.1, rh: 47.7, p: 98.8 })
    expect(parsed.objects).toHaveLength(8)
    expect(parsed.objects[0]).toMatchObject({
      name: 'Стоматологическая установка, рабочее место врача',
      department: 'Кабинет стоматолога-хирурга',
    })
    expect(parsed.results.map((r) => r.factValue)).toEqual([...E, ...E.map(() => '≤1,0')])
    expect(parsed.results.map((r) => r.unitSymbol)).toEqual([
      ...E.map(() => 'лк'),
      ...E.map(() => '%'),
    ])
    // КП той же точки — тот же объект, что и Е
    expect(parsed.results.slice(8).map((r) => r.objectSeq)).toEqual(
      parsed.results.slice(0, 8).map((r) => r.objectSeq),
    )
    expect(parsed.equipment.map((e) => e.serialRaw)).toEqual([
      '086205',
      '26010128',
      '431019',
      '26-14-00176',
    ])
  })

  it('XML совпадает с эталонной выгрузкой клиента', async () => {
    const built = await buildRealProtocolXml({
      name: '150-26-О',
      applicationDate: '2026-08-31',
      customer: RADUGA_MED,
      engineer: KORSHUNOV,
      equipment: {
        // коды — из «ID персонал и оборудование.xlsx» лаборатории
        '086205': 1142261,
        '26010128': 3963796,
        '431019': 1142241,
        '26-14-00176': 3897355,
      },
      // в Excel «+78332463121», в выгрузке — телефон из карточки заказчика
      protocolPatch: { customerPhone: '88332472131' },
    })
    expect(built.resultsWithOa).toBe(16)
    expect(normalizeForCompare(built.xml)).toBe(normalizeForCompare(realReferenceXml('150-26-О')))
  })
})
