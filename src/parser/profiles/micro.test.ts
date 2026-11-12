import { describe, expect, it } from 'vitest'
import { createSeedBundle } from '@/data/seed'
import { parseProtocol } from '@/parser'
import {
  GROMOV,
  buildRealProtocolXml,
  normalizeForCompare,
  realReferenceXml,
  realXlsx,
} from '@/parser/fixtures/real-reference.test-utils'

const T = ['23,2', '23,4', '23,3', '23,3', '23,2', '23,2', '23,4', '23,4']
const RH = ['33,2', '33,4', '33,6', '34,2']

describe('26-МК микроклимат (МИ М.08−2021) — боевой 204-26-МК', () => {
  it('разбор: лист МИ (ГОСТ/БВЕК — шаблонные), 4 видимые точки × 2 высоты', () => {
    const seed = createSeedBundle()
    const parsed = parseProtocol({
      data: realXlsx('204-26-МК'),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.parserProfile).toBe('micro')
    expect(parsed.sheetName).toBe('Протокол Микроклимат МИ')
    expect(parsed.metadata.number).toBe('204-26-МК')
    expect(parsed.metadata.measureStart).toBe('2026-11-10')
    expect(parsed.metadata.engineerShortName).toBe('Громов А.В.')
    // «Температура наружного воздуха» — не условия измерений в помещении
    expect(parsed.metadata.conditions.t).toBeUndefined()
    expect(parsed.objects).toHaveLength(4)
    expect(parsed.objects[3]).toMatchObject({
      name: 'Рентгенаппарат, рабочее место рентгенолаборанта',
    })
    expect(parsed.results.map((r) => r.factValue)).toEqual([
      ...T,
      ...RH,
      ...T.map(() => '≤0,10'),
    ])
    expect([...new Set(parsed.results.map((r) => r.unitSymbol))]).toEqual(['°С', '%', 'м/с'])
  })

  it('XML совпадает с эталонной выгрузкой клиента', async () => {
    const built = await buildRealProtocolXml({
      name: '204-26-МК',
      applicationDate: '2026-11-05',
      customer: {
        name: 'ООО "Надежда"',
        inn: '1200015197',
        ogrn: '1241200002042',
        legalAddress: '424004, Республика Марий Эл, г Йошкар-Ола, Первомайская ул, д. 49, помещ. 2',
      },
      engineer: GROMOV,
      equipment: { '431019': 1142241, '26-14-00176': 3897355, '3069': null },
    })
    expect(built.resultsWithOa).toBe(20)
    expect(normalizeForCompare(built.xml)).toBe(normalizeForCompare(realReferenceXml('204-26-МК')))
  })
})
