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
  /** лист, если в книге заполнено несколько */
  sheet?: string
  /** эталон не соответствует присланному Excel — сверяем только разбор */
  xmlFromOtherVersion?: string
  /** ручная привязка оборудования, названного в протоколе иначе, чем в справочнике */
  equipment?: Record<string, number | null>
  note?: string
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
  // 26-ЭП. Утечка — по формату ячейки («0,07200»); в 403 / 426 эталон без хвостового нуля
  { name: '412-26-ЭП', results: 38, note: 'ЭП 2 р.м плёнка и цифра' },
  { name: '385-26-ЭП', results: 35, note: 'ЭП Телеуправляемый УРИ+цифра' },
  { name: '386-26-ЭП', results: 23, note: 'ЭП Палатный со скопией+цифра' },
  { name: '414-26-ЭП', results: 20, note: 'ЭП Флюорограф без УРИ' },
  {
    name: '403-26-ЭП',
    results: 28,
    note: 'ЭП Ортопантомограф: обе сигнализации (в эталоне — одна), утечка с форматом',
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
    xmlFromOtherVersion: 'анодное напряжение в эталоне (20,32 / 20,38 …) нет в присланном Excel',
  },
  { name: '201-26-АС', results: 12, note: 'АС LITE, второй образец' },
]

// разбор реального xlsx + bootstrap сервера — дольше 5 с при параллельном прогоне
describe('боевые протоколы лаборатории → XML = эталон', { timeout: 60_000 }, () => {
  it.each(CASES)('$name ($note)', async ({ name, results, adjust, equipment, ignoreOrder, sheet, xmlFromOtherVersion }) => {
    const built = await buildRealProtocolXml({ name, customer: 'fromReference', lab: true, equipment, sheet })
    expect(built.resultsTotal).toBe(results)
    expect(built.resultsWithOa).toBe(results)
    if (xmlFromOtherVersion) return
    const reference = adjust
      ? adjustReference(realReferenceXml(name), adjust)
      : realReferenceXml(name)
    const norm = ignoreOrder ? normalizeIgnoringResultOrder : normalizeForCompare
    const a = norm(built.xml)
    const b = norm(reference)
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
