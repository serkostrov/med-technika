import { describe, expect, it } from 'vitest'
import { createSeedBundle } from '@/data/seed'
import { parseProtocol } from '@/parser'
import { objectNameFromOa } from '@/parser/upload-service'
import { isLabAddress } from '@/fgis-xml/emit-protocol'
import {
  GROMOV,
  buildRealProtocolXml,
  normalizeForCompare,
  realReferenceXml,
  realXlsx,
} from '@/parser/fixtures/real-reference.test-utils'

// разбор реального xlsx + bootstrap сервера — дольше 5 с при параллельном прогоне
describe('26-СЗ средства защиты (ФР.1.38.2021.40260) — боевой 125-26-СЗ', { timeout: 30_000 }, () => {
  it('разбор: лист «РАНДОМ 25», 5 изделий; шапка 26-СЗ (испытательное перед вспомогательным)', () => {
    const seed = createSeedBundle()
    const parsed = parseProtocol({
      data: realXlsx('125-26-СЗ'),
      forms: seed.protocolForms,
      indicatorMaps: seed.formIndicatorMaps,
    })
    expect(parsed.parserProfile).toBe('sz')
    expect(parsed.sheetName).toBe('Средства защиты (СЗ)_ РАНДОМ 25')
    expect(parsed.metadata.number).toBe('125-26-СЗ')
    // правее «Громов А.В.» в строке — служебное «пластина 3»
    expect(parsed.metadata.engineerShortName).toBe('Громов А.В.')
    expect(parsed.metadata.measureAddress).toMatch(/переулок Искожевский, дом 16/)
    expect(parsed.metadata.measurePlace).toBeNull()
    expect(parsed.results.map((r) => r.factValue)).toEqual(['0,507', '0,252', '0,252', '0,254', '0,353'])
    expect(parsed.objects[0]!.serialNo).toBe('2757')
    expect(parsed.equipment.map((e) => [e.kind, e.serialRaw])).toEqual([
      ['si', 'CB2-19090040'],
      ['si', '26-14-00176'],
      ['si', '431019'],
      ['aux', '4'],
      ['aux', null],
      ['test', '1811'],
      ['test', '3'],
    ])
  })

  it('XML совпадает с эталоном: объект из ОА, измерения в ИЛ (AddressID), 7 единиц оборудования', async () => {
    const built = await buildRealProtocolXml({
      name: '125-26-СЗ',
      applicationDate: '2026-11-03',
      customer: {
        name: 'ООО "Надежда"',
        inn: '1200015197',
        ogrn: '1241200002042',
        legalAddress: '424004, Республика Марий Эл, г Йошкар-Ола, Первомайская ул, д. 49, помещ. 2',
      },
      engineer: GROMOV,
      equipment: {
        'CB2-19090040': 568941,
        '26-14-00176': 3897355,
        '431019': 1142241,
        '1811': 365685,
        '3': 568948,
        '4': 365684,
        'name:Диафрагма-коллиматор свинцовая (из 3-х пластин)': 1142539,
      },
    })
    expect(built.resultsWithOa).toBe(5)
    expect(normalizeForCompare(built.xml)).toBe(normalizeForCompare(realReferenceXml('125-26-СЗ')))
  })
})

describe('общие правила, найденные на 26-СЗ', () => {
  it('адрес ИЛ узнаётся в полном адресе, но не в чужом', () => {
    const lab = 'пер. Искожевский, 16'
    expect(isLabAddress('610005, Кировская область, г. Киров, переулок Искожевский, дом 16, пом. 1002, 1003', lab)).toBe(true)
    expect(isLabAddress('610005, г. Киров, ул. Искожевский, д. 116', lab)).toBe(false)
    expect(isLabAddress('613340, Кировская область, г. Cоветск, ул. Октябрьская, д. 70', lab)).toBe(false)
  })

  it('объект из ОА — уточнение в скобках', () => {
    expect(objectNameFromOa('Средства защиты прочие (передвижные средства защиты)')).toBe('передвижные средства защиты')
    expect(objectNameFromOa('Вентиляционные системы')).toBe('Вентиляционные системы')
    expect(objectNameFromOa(null)).toBeNull()
  })
})
