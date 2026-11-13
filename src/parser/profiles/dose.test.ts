import { describe, expect, it } from 'vitest'
import { createSeedBundle } from '@/data/seed'
import { parseProtocol } from '@/parser'
import {
  KORSHUNOV,
  buildRealProtocolXml,
  normalizeForCompare,
  realReferenceXml,
  realXlsx,
} from '@/parser/fixtures/real-reference.test-utils'

const OUTPUT = ['0,047', '0,048', '0,048', '0,047', '0,047', '0,048', '0,047', '0,047', '0,048', '0,047', '0,047', '0,047']
const DOSE = ['0,00014', '0,00018', '0,00153', '0,00011', '0,00019', '0,00183', '0,00011', '0,00014', '0,00122', '0,00009', '0,00015', '0,00142']

// разбор реального xlsx + bootstrap сервера — дольше 5 с при параллельном прогоне
describe('26-ЭД расширенный «Дентальный_» — боевой 272-26-ЭД', { timeout: 30_000 }, () => {
  it('разбор: лист «Дентальный_» среди шаблонных; 12 процедур × (выход на мА·с, эфф. доза)', () => {
    const seed = createSeedBundle()
    const parsed = parseProtocol({
      data: realXlsx('272-26-ЭД'),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.parserProfile).toBe('dose')
    expect(parsed.sheetName).toBe('Дентальный_')
    expect(parsed.formTitle).toBe('Дентальный_')
    expect(parsed.metadata.number).toBe('272-26-ЭД')
    expect(parsed.metadata.engineerShortName).toBe('Коршунов Е.В.')
    expect(parsed.objects).toHaveLength(12)
    expect(parsed.objects[0]).toMatchObject({ name: 'Резцы', department: 'Взрослые, Верхняя челюсть' })
    expect(parsed.objects[11]).toMatchObject({ name: 'Моляры', department: 'Дети, Нижняя челюсть' })
    expect(parsed.results.map((r) => r.factValue)).toEqual([...OUTPUT, ...DOSE])
    expect(parsed.results.map((r) => r.unitSymbol)).toEqual([
      ...OUTPUT.map(() => 'мГр·м²/(мА·с)'),
      ...DOSE.map(() => 'мЗв'),
    ])
  })

  it('XML совпадает с эталоном', async () => {
    const built = await buildRealProtocolXml({
      name: '272-26-ЭД',
      applicationDate: '2026-10-22',
      customer: {
        name: 'ООО "Вятка-Дент"',
        inn: '4345051571',
        ogrn: '1024301351062',
        legalAddress: '610014, Кировская область, город Киров, ул. Сурикова, д. 31, помещ. 1002',
      },
      engineer: KORSHUNOV,
      // коды — из «ID персонал и оборудование.xlsx» лаборатории
      equipment: { 'CB2-19090040': 1142539, '431019': 1142241, '26-14-00176': 3897355 },
      // в Excel место испытаний — «ул. Сурикова, д. 31», в выгрузке — другой адрес [вопрос к ИЛ]
      protocolPatch: {
        measureAddress: '610016, Кировская область, город Киров, ул. Чернышевского, д. 7',
      },
    })
    expect(built.resultsWithOa).toBe(24)
    expect(normalizeForCompare(built.xml)).toBe(normalizeForCompare(realReferenceXml('272-26-ЭД')))
  })
})
