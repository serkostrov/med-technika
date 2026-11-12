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

// места 4–5 в Excel есть, но строки скрыты → в протокол и ФГИС не идут
const FACTS = ['50,0', '51,2', '44,8', '46,0', '46,0', '47,2']

// разбор реального xlsx + bootstrap сервера — дольше 5 с при параллельном прогоне
describe('26-Ш шум (ГОСТ ISO 9612) — боевой 29-26-Ш', { timeout: 30_000 }, () => {
  it('разбор: 3 видимых рабочих места × (LEX,8h + фактическая смена), шапка, 5 СИ', () => {
    const seed = createSeedBundle()
    const parsed = parseProtocol({
      data: realXlsx('29-26-Ш'),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.parserProfile).toBe('noise')
    expect(parsed.metadata.number).toBe('29-26-Ш')
    expect(parsed.metadata.protocolDate).toBe('2026-09-25')
    expect(parsed.metadata.measureStart).toBe('2026-09-08')
    expect(parsed.metadata.measureEnd).toBe('2026-09-08')
    expect(parsed.metadata.objectFullName).toBe('Рабочие места')
    expect(parsed.metadata.engineerShortName).toBe('Коршунов Е.В.')
    expect(parsed.metadata.conditions).toMatchObject({ t: 23, rh: 46, p: 98.81 })
    expect(parsed.objects.map((o) => o.name)).toEqual([
      'Стоматологический кабинет №1, рабочее место врача',
      'Гинекологический кабинет №2, рабочее место врача',
      'Рентген кабинет, рабочее место рентгенолаборанта',
    ])
    expect(parsed.results.map((r) => r.factValue)).toEqual(FACTS)
    expect(parsed.results.map((r) => r.sourceKey)).toEqual(
      Array.from({ length: 3 }, () => ['laeq_8h', 'laeq_shift']).flat(),
    )
    expect(parsed.results.every((r) => r.unitSymbol === 'дБА')).toBe(true)
    expect(parsed.equipment.map((e) => e.serialRaw)).toEqual([
      '145013',
      '118316',
      '431019',
      '26-14-00176',
      '3069',
    ])
  })

  it('XML совпадает с эталонной выгрузкой клиента', async () => {
    const built = await buildRealProtocolXml({
      name: '29-26-Ш',
      applicationDate: '2026-08-31',
      customer: RADUGA_MED,
      engineer: KORSHUNOV,
      equipment: {
        // коды — из «ID персонал и оборудование.xlsx» лаборатории
        '145013': 566934,
        '118316': 566956,
        '431019': 1142241,
        '26-14-00176': 3897355,
        // в справочнике у секундомера 567064, но в этой выгрузке его нет [вопрос к ИЛ]
        '3069': null,
      },
    })
    expect(built.resultsWithOa).toBe(6)
    expect(normalizeForCompare(built.xml)).toBe(normalizeForCompare(realReferenceXml('29-26-Ш')))
  })
})
