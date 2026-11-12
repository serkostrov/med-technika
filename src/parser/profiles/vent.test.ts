import { describe, expect, it } from 'vitest'
import { createSeedBundle } from '@/data/seed'
import { parseProtocol } from '@/parser'
import {
  buildRealProtocolXml,
  normalizeForCompare,
  realReferenceXml,
  realXlsx,
} from '@/parser/fixtures/real-reference.test-utils'

// разбор реального xlsx + bootstrap сервера — дольше 5 с при параллельном прогоне
describe('26-АС вентиляция (МР 4.3.0212-20 LITE) — боевой 260-26-АС', { timeout: 30_000 }, () => {
  it('разбор: 2 видимые системы × (производительность, кратность); шаблонные листы пропущены', () => {
    const seed = createSeedBundle()
    const parsed = parseProtocol({
      data: realXlsx('260-26-АС'),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.parserProfile).toBe('vent')
    expect(parsed.sheetName).toBe('Протокол МР 4.3.0212-20 (LITE)')
    expect(parsed.metadata.number).toBe('260-26-АС')
    expect(parsed.metadata.engineerShortName).toBe('Вязнин П.Л.')
    expect(parsed.objects.map((o) => o.name)).toEqual([
      'Рентген кабинет, процедурная: Вытяжная',
      'Рентген кабинет, процедурная: Приточная',
    ])
    expect(parsed.results.map((r) => [r.sourceKey, r.factValue, r.unitSymbol])).toEqual([
      ['air_flow', '16', 'м3/ч'],
      ['air_flow', '96', 'м3/ч'],
      ['air_exchange', '1,0', 'час-1'],
      ['air_exchange', '6,2', 'час-1'],
    ])
    // скрытые альтернативные СИ (второй Метеоскоп, ТТМ-2-01, Р20У2К) не попадают
    expect(parsed.equipment.map((e) => e.serialRaw)).toEqual(['431019', '26-14-00176'])
  })

  it('XML совпадает с эталонной выгрузкой клиента', async () => {
    const built = await buildRealProtocolXml({
      name: '260-26-АС',
      applicationDate: '2026-06-16',
      customer: {
        name: 'ООО "Стоматология 21 Века"',
        inn: '4345225130',
        ogrn: '1084345006767',
        legalAddress: '610007, Кировская область, город Киров, Верхосунская ул., д. 20',
      },
      engineer: {
        shortName: 'Вязнин П.Л.',
        fullName: 'Вязнин П.Л.',
        surname: 'Вязнин',
        fgisIdFullName: 402862,
      },
      equipment: { '431019': 1142241, '26-14-00176': 3897355 },
    })
    expect(built.resultsWithOa).toBe(4)
    expect(normalizeForCompare(built.xml)).toBe(normalizeForCompare(realReferenceXml('260-26-АС')))
  })
})
