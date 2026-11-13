import { describe, expect, it } from 'vitest'
import { createSeedBundle } from '@/data/seed'
import { parseProtocol } from '@/parser'
import {
  buildRealProtocolXml,
  normalizeForCompare,
  realReferenceXml,
  realXlsx,
} from '@/parser/fixtures/real-reference.test-utils'

const VYAZNIN = {
  shortName: 'Вязнин П.Л.',
  fullName: 'Вязнин П.Л.',
  surname: 'Вязнин',
  fgisIdFullName: 402862,
}

// разбор реального xlsx + bootstrap сервера — дольше 5 с при параллельном прогоне
describe('26-ЭП дентальный (периодические испытания) — боевой 426-26-ЭП', { timeout: 30_000 }, () => {
  it('разбор: 12 разделов, 29 значений в порядке эталона; аппарат из шапки', () => {
    const seed = createSeedBundle()
    const parsed = parseProtocol({
      data: realXlsx('426-26-ЭП'),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.parserProfile).toBe('xray')
    expect(parsed.metadata.number).toBe('426-26-ЭП')
    expect(parsed.metadata.engineerShortName).toBe('Вязнин П.Л.')
    expect(parsed.objects).toEqual([
      {
        seq: 1,
        name: 'установка рентгеновская стоматологическая X-Mind DC',
        serialNo: 'D35354',
        year: '2016',
        department: null,
      },
    ])
    expect(parsed.results.map((r) => r.factValue)).toEqual([
      'наличие', '2,5', '2,23',
      '59,88', '69,49', '69,45', '0,20', '0,73', '0,79',
      '0,0979', '0,9973', '2,10', '0,27', '0,0978', '0,9976', '2,20', '0,24',
      '0,0279', '0,0672', '0,0020',
      '0,046', '0,058', '0,061', '0,047', '0,059',
      '0,0576', 'отсутствие', '6,3', '1,0',
    ])
    // скрытые Unfors Xi и ТПР-1-2 не применялись; подсказки шаблона правее не попадают
    expect(parsed.equipment.map((e) => [e.kind, e.serialRaw])).toEqual([
      ['si', 'CB2-19090040'],
      ['si', '431019'],
      ['si', '26-14-00176'],
      ['aux', '4'],
      ['test', '10-301-0751'],
    ])
  })

  it('XML совпадает с эталоном: объект из ОА, Directory/MeasurementId как у клиента', async () => {
    const built = await buildRealProtocolXml({
      name: '426-26-ЭП',
      applicationDate: '2026-06-16',
      customer: {
        name: 'ООО "Стоматология 21 Века"',
        inn: '4345225130',
        ogrn: '1084345006767',
        legalAddress: '610007, Кировская область, город Киров, Верхосунская ул., д. 20',
      },
      engineer: VYAZNIN,
      // коды — из «ID персонал и оборудование.xlsx» лаборатории
      equipment: {
        'CB2-19090040': 1142539,
        '431019': 1142241,
        '26-14-00176': 3897355,
        '4': 568941,
        '10-301-0751': 365686,
      },
    })
    expect(built.resultsWithOa).toBe(29)
    expect(normalizeForCompare(built.xml)).toBe(normalizeForCompare(realReferenceXml('426-26-ЭП')))
  })
})
