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

describe('26-ПЧ ЭМП (ФР.1.34.2021.39109) — боевой 52-26-ПЧ', () => {
  it('разбор: 1 видимое рабочее место × 4 показателя × 3 высоты; скрытые таблица и СИ пропущены', () => {
    const seed = createSeedBundle()
    const parsed = parseProtocol({
      data: realXlsx('52-26-ПЧ'),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.parserProfile).toBe('emf')
    expect(parsed.metadata.number).toBe('52-26-ПЧ')
    expect(parsed.metadata.measureStart).toBe('2026-09-08')
    expect(parsed.metadata.measureAddress).toBe(
      '610007, Кировская область, город Киров, ул. Рудницкого, д. 12, пом. 1004',
    )
    expect(parsed.objects).toHaveLength(1)
    expect(parsed.objects[0]!.name).toMatch(/^Рабочее место рентгенолаборанта: ноутбук Dell/)
    expect(parsed.results.map((r) => r.sourceKey)).toEqual(
      ['h_5hz_2khz', 'h_2_400khz', 'e_5hz_2khz', 'e_2_400khz'].flatMap((k) => [k, k, k]),
    )
    expect(parsed.results.map((r) => r.factValue)).toEqual(
      ['≤62,5', '≤5,00', '≤5,00', '≤0,50'].flatMap((v) => [v, v, v]),
    )
    expect(parsed.results.map((r) => r.unitSymbol)).toEqual(
      ['нТл', 'нТл', 'В/м', 'В/м'].flatMap((u) => [u, u, u]),
    )
    // СТ-01 и П3-31 — в скрытых строках (не применялись)
    expect(parsed.equipment.map((e) => e.serialRaw)).toEqual([
      '179714',
      '431019',
      '26-14-00176',
      '3069',
    ])
  })

  it('XML совпадает с эталонной выгрузкой клиента', async () => {
    const built = await buildRealProtocolXml({
      name: '52-26-ПЧ',
      applicationDate: '2026-08-31',
      customer: RADUGA_MED,
      engineer: KORSHUNOV,
      equipment: {
        '179714': 567064,
        '431019': 1142241,
        '26-14-00176': 3897355,
        '3069': 571521,
      },
    })
    expect(built.resultsWithOa).toBe(12)
    expect(normalizeForCompare(built.xml)).toBe(normalizeForCompare(realReferenceXml('52-26-ПЧ')))
  })
})
