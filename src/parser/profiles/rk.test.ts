import { describe, expect, it } from 'vitest'
import { createSeedBundle } from '@/data/seed'
import { parseProtocol } from '@/parser'
import {
  buildRealProtocolXml,
  normalizeIgnoringResultOrder,
  realReferenceXml,
  realXlsx,
} from '@/parser/fixtures/real-reference.test-utils'

const LE5 = '≤5,0'
const LE007 = '≤0,007'

// разбор реального xlsx + bootstrap сервера — дольше 5 с при параллельном прогоне
describe('26-РК стоматологический (МУК 2.6.1.3829-22) — боевой 328-26-РК', { timeout: 30_000 }, () => {
  it('разбор: 12 видимых точек; по группам — Ḣ*(10), затем Ė пр (кроме груди/гонад/ног)', () => {
    const seed = createSeedBundle()
    const parsed = parseProtocol({
      data: realXlsx('328-26-РК'),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.parserProfile).toBe('rk')
    expect(parsed.sheetName).toBe('Стоматологический')
    expect(parsed.metadata.number).toBe('328-26-РК')
    expect(parsed.metadata.engineerShortName).toBe('Вязнин П.Л.')
    expect(parsed.objects).toHaveLength(12)
    expect(parsed.objects[0]).toMatchObject({
      name: 'Над рентген-кабинетом',
      department: 'Помещения, смежные с процедурной рентгеновского кабинета и прилегающие территории',
    })
    expect(parsed.objects[8]).toMatchObject({ name: 'Голова' })
    // по группам точек: смежные помещения (8), затем рабочее место (4)
    expect(parsed.results.map((r) => r.factValue)).toEqual([
      '132,250', ...Array.from({ length: 7 }, () => LE5),
      '0,195', ...Array.from({ length: 7 }, () => LE007),
      ...Array.from({ length: 4 }, () => LE5),
      LE007,
    ])
    expect(new Set(parsed.results.map((r) => r.unitSymbol))).toEqual(new Set(['мкЗв/ч']))
    // испытательное оборудование — в строке заголовка раздела
    expect(parsed.equipment.map((e) => [e.kind, e.serialRaw])).toEqual([
      ['si', '55670'],
      ['si', '26-14-00176'],
      ['si', '431019'],
      ['si', '1884'],
      ['test', null],
    ])
  })

  it('XML совпадает с эталоном', async () => {
    const built = await buildRealProtocolXml({
      name: '328-26-РК',
      applicationDate: '2026-06-16',
      customer: {
        name: 'ООО "Стоматология 21 Века"',
        inn: '4345225130',
        ogrn: '1084345006767',
        legalAddress: '610007, Кировская область, город Киров, Верхосунская ул., д. 20',
      },
      engineer: { shortName: 'Вязнин П.Л.', fullName: 'Вязнин П.Л.', surname: 'Вязнин', fgisIdFullName: 402862 },
      // коды — из «ID персонал и оборудование.xlsx» лаборатории; фантом в протоколе
      // назван иначе, чем в справочнике, — в тесте как в протоколе (в работе — ручная привязка)
      equipment: {
        '55670': 1142179,
        '26-14-00176': 3897355,
        '431019': 1142241,
        '1884': 1458157,
        'name:фантом (водный) Ø150 х 200 мм': 365678,
      },
    })
    expect(built.resultsWithOa).toBe(21)
    // порядок Ḣ / Ė в этом эталоне не по группам точек (старая программа клиента непоследовательна,
    // см. 305 / 324) — записи совпадают, порядок не сверяем
    expect(normalizeIgnoringResultOrder(built.xml)).toBe(
      normalizeIgnoringResultOrder(realReferenceXml('328-26-РК')),
    )
  })
})
