import { describe, expect, it } from 'vitest'
import { FormStatus } from '@/domain'
import { createSeedBundle } from '@/data/seed'
import { parseProtocol, ParseError } from '@/parser'
import {
  adjustReference,
  buildRealProtocolXml,
  normalizeForCompare,
  normalizeIgnoringResultOrder,
  realReferenceXml,
  realXlsx,
} from '@/parser/fixtures/real-reference.test-utils'

/**
 * Пары «протокол + XML» лаборатории (ноябрь 2026, папки 26-МТ / 26-РК / 26-АС / …):
 * загрузка Excel → сохранение → XML и сверка с эталоном. Справочники — лаборатории
 * (оборудование и персонал из «ID персонал и оборудование.xlsx»), заказчик — с
 * реквизитами из эталона, дата заявки — из эталона.
 */
type Case = {
  name: string
  results: number
  /** поправка эталона на ответы ИЛ 16.11.2026 */
  adjust?: Parameters<typeof adjustReference>[1]
  /** эталон с другим порядком записей (старая программа клиента непоследовательна) */
  ignoreOrder?: boolean
  /** в эталоне не все результаты (108 из 192 / 154) — сверяем первые N у обоих */
  compareFirst?: number
  /** лист, если в книге заполнено несколько */
  sheet?: string
  /** ручная привязка оборудования, названного в протоколе иначе, чем в справочнике */
  equipment?: Record<string, number | null>
  note?: string
}

/** запись КТ «U» / «точность U» как в эталоне 415-26-ЭП */
function ctKv(indicator: string, value: string, unit: number): string {
  return `<ResearchObjectInfo>${indicator}<FactValue>${value}</FactValue><MeasurementId>${unit}</MeasurementId><UniqueMethod>МУК 2.6.7.3652-20, п.6.11</UniqueMethod><DocNameMethodikId>1140</DocNameMethodikId></ResearchObjectInfo>`
}

const CASES: Case[] = [
  { name: '50-26-МТ', results: 10, note: 'ПОТОК-1' },
  { name: '57-26-МТ', results: 2, note: 'Магнито-терапия' },
  { name: '47-26-МТ', results: 4, note: 'Лазер ИМИ, объект — полное наименование из ОА' },
  { name: '5-26-ИВЛ', results: 5, note: 'ИВЛ: видим только последний аппарат, «пункт не применим» пропущен' },
  { name: '6-26-ИВЛ', results: 1, note: 'концентраторы' },
  { name: '4-26-Ц', results: 6, note: 'Центрифуги, телефон из карточки (в Excel — два номера слитно)' },
  {
    name: '302-26-РК',
    results: 5,
    note: 'РК Палатник',
    // в справочнике — «Фантом тканеэквивалентный (водный) с шкалой 250х250х150мм»
    equipment: { 'name:фантом (водный) 250 х 250 х 150 мм': 365692 },
  },
  { name: '305-26-РК', results: 25, note: 'РК КТ' },
  {
    name: '324-26-РК',
    results: 47,
    note: 'РК Флюорограф С КАБИНОЙ, шаблонные листы с номером-заглушкой',
    // в справочнике — «Фантом тканеэквивалентный (водный) 250х250х75мм»
    equipment: { 'name:фантом (водный) 250 х 250 х 75 мм': 365687 },
  },
  {
    name: '322-26-РК',
    results: 54,
    note: 'РК 2 рабочих места',
    ignoreOrder: true,
    equipment: { 'name:фантом (водный) 250 х 250 х 150 мм': 365692 },
  },
  { name: '262-26-АС', results: 12, note: 'АС МР 4.3.0212-20 (полная таблица)' },
  // 26-ЭП. Утечка — по формату ячейки («0,07200»), ИЛ 19.11.2026: знаков — как в формате;
  // в 403 / 426 эталон без хвостового нуля (потерян при копировании)
  // 26-ЭД расширенный: в эталонах 108 результатов — ручной отбор из-за сложностей ФГИС
  // при > 100 строках; по ИЛ 19.11.2026 нужны все строки эффективной дозы
  {
    name: '251-26-ЭД',
    results: 192,
    note: 'ЭД расширенный: новый рентген аппараты',
    compareFirst: 108,
    adjust: { replace: [['<FactValue>0,519</FactValue>', '<FactValue>0,5190</FactValue>']] },
  },
  {
    name: '252-26-ЭД',
    results: 154,
    note: 'ЭД расширенный: палатник; скрытая строка 0,009 в эталоне — по ИЛ не нужна',
    compareFirst: 100,
    adjust: { removeResultAt: 7 },
  },
  { name: '25-26-ПП', results: 6, note: 'ПП МУК 4.3.2491-09' },
  { name: '412-26-ЭП', results: 38, note: 'ЭП 2 р.м плёнка и цифра' },
  {
    name: '419-26-ЭП',
    results: 42,
    note: 'ЭП КТ периодич: U и точность U (в эталоне их нет — ИЛ 19.11.2026: нужны)',
    adjust: {
      insertResultsAfter: {
        at: 4,
        results: [
          ...['78,59', '111,90', '133,10'].map((v) => ctKv('<IndicatorId>1631</IndicatorId><UniqueIndicator></UniqueIndicator><Directory>DM-55254</Directory>', v, 46)),
          ...['1,76', '1,73', '2,38'].map((v) => ctKv('<IndicatorId></IndicatorId><UniqueIndicator>Точность анодного напряжения</UniqueIndicator><Directory></Directory>', v, 292)),
        ],
      },
    },
  },
  {
    name: '415-26-ЭП',
    results: 42,
    note: 'ЭП КТ периодич: U и точность U во ФГИС',
    // толщина слоя — по формату ячейки 0.0 (ИЛ 19.11.2026), в эталоне «10,00»
    adjust: { replace: [['<FactValue>10,00</FactValue>', '<FactValue>10,0</FactValue>']] },
  },
  { name: '385-26-ЭП', results: 35, note: 'ЭП Телеуправляемый УРИ+цифра' },
  { name: '386-26-ЭП', results: 23, note: 'ЭП Палатный со скопией+цифра' },
  { name: '414-26-ЭП', results: 20, note: 'ЭП Флюорограф без УРИ' },
  {
    name: '403-26-ЭП',
    results: 28,
    note: 'ЭП Ортопантомограф: обе сигнализации (ИЛ: можно одну или две), утечка с форматом',
    adjust: {
      duplicateResultAt: 1,
      replace: [['<FactValue>0,0756</FactValue>', '<FactValue>0,07560</FactValue>']],
      // в эталоне — юр. адрес заказчика; в протоколе «Адрес:» без «помещ. 1023»
      measureAddress: '610027, Кировская область, г. Киров, ул. Воровского, д. 71',
    },
  },
  {
    name: '408-26-ЭП',
    results: 39,
    note: 'ЭП Маммограф: заполнены 2 листа, выбор пользователя',
    sheet: 'Маммограф пленка+цифра',
    // Excel — версия, ушедшая во ФГИС (ИЛ 19.11.2026). Мультиметр RGK DM-20 в протоколе
    // (СИ №3), в эталоне пропущен; в остальных ЭП он выгружен
    adjust: { addEquipmentIds: [3963796] },
  },
  { name: '201-26-АС', results: 12, note: 'АС LITE, второй образец' },
  {
    name: '58-26-ПЧ',
    results: 12,
    note: 'ПЧ БВЕК — основной лист (ИЛ 19.11.2026); заполнен и лист ФР',
    sheet: 'БВЕК.431440.08.04 РЭ',
    // значения в эталоне — с листа ФР («≤62,5»); на листе БВЕК напечатано «<62,5»
    adjust: { replace: [['≤', '&lt;']] },
  },
]

// разбор реального xlsx + bootstrap сервера — дольше 5 с при параллельном прогоне
const RESULT_RE = /<ResearchObjectInfo>[\s\S]*?<\/ResearchObjectInfo>/g
function keepFirstResults(xml: string, n: number): string {
  let i = 0
  return xml.replace(RESULT_RE, (m) => (++i <= n ? m : ''))
}

describe('боевые протоколы лаборатории → XML = эталон', { timeout: 60_000 }, () => {
  it.each(CASES)('$name ($note)', async ({ name, results, adjust, equipment, ignoreOrder, sheet, compareFirst }) => {
    const built = await buildRealProtocolXml({ name, customer: 'fromReference', lab: true, equipment, sheet })
    expect(built.resultsTotal).toBe(results)
    expect(built.resultsWithOa).toBe(results)
    expect(built.unitErrors).toEqual([])
    const reference = adjust
      ? adjustReference(realReferenceXml(name), adjust)
      : realReferenceXml(name)
    const norm = ignoreOrder ? normalizeIgnoringResultOrder : normalizeForCompare
    const cut = (xml: string) => (compareFirst ? keepFirstResults(xml, compareFirst) : xml)
    const a = norm(cut(built.xml))
    const b = norm(cut(reference))
    let i = 0
    while (i < a.length && a[i] === b[i]) i += 1
    const at = `[${name}] наш: …${a.slice(Math.max(0, i - 80), i + 120)}…
эталон: …${b.slice(Math.max(0, i - 80), i + 120)}…`
    expect(a === b, at).toBe(true)
  })
})

describe('определение формы среди шаблонных листов', () => {
  it('заполнен лист формы без материалов — честный отказ, а не разбор шаблонного листа готовой формы', () => {
    // 262-26-АС: «Протокол МР 4.3.0212-20» от 16.11.2026, «(LITE)» — шаблон «1-26-АС от 10.01.2026»
    const seed = createSeedBundle()
    const forms = seed.protocolForms.map((f) =>
      f.sheetName === 'Протокол МР 4.3.0212-20' ? { ...f, status: FormStatus.no_materials } : f,
    )
    let error: unknown = null
    try {
      parseProtocol({ data: realXlsx('262-26-АС'), forms, indicatorMaps: seed.formIndicatorMaps })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ParseError)
    expect((error as ParseError).code).toBe('NO_MATERIALS')
  })
})
