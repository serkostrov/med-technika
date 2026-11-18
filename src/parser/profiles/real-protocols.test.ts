import { describe, expect, it } from 'vitest'
import {
  adjustReference,
  buildRealProtocolXml,
  normalizeForCompare,
  realReferenceXml,
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
  /** ручная привязка оборудования, названного в протоколе иначе, чем в справочнике */
  equipment?: Record<string, number | null>
  note?: string
}

const CASES: Case[] = [
  { name: '50-26-МТ', results: 10, note: 'ПОТОК-1' },
  { name: '57-26-МТ', results: 2, note: 'Магнито-терапия' },
  { name: '47-26-МТ', results: 4, note: 'Лазер ИМИ, объект — полное наименование из ОА' },
  { name: '4-26-Ц', results: 6, note: 'Центрифуги, телефон из карточки (в Excel — два номера слитно)' },
  {
    name: '302-26-РК',
    results: 5,
    note: 'РК Палатник',
    // в справочнике — «Фантом тканеэквивалентный (водный) с шкалой 250х250х150мм»
    equipment: { 'name:фантом (водный) 250 х 250 х 150 мм': 365692 },
  },
  { name: '201-26-АС', results: 12, note: 'АС LITE, второй образец' },
]

// разбор реального xlsx + bootstrap сервера — дольше 5 с при параллельном прогоне
describe('боевые протоколы лаборатории → XML = эталон', { timeout: 60_000 }, () => {
  it.each(CASES)('$name ($note)', async ({ name, results, adjust, equipment }) => {
    const built = await buildRealProtocolXml({ name, customer: 'fromReference', lab: true, equipment })
    expect(built.resultsTotal).toBe(results)
    expect(built.resultsWithOa).toBe(results)
    const reference = adjust
      ? adjustReference(realReferenceXml(name), adjust)
      : realReferenceXml(name)
    const a = normalizeForCompare(built.xml)
    const b = normalizeForCompare(reference)
    let i = 0
    while (i < a.length && a[i] === b[i]) i += 1
    const at = `наш: …${a.slice(Math.max(0, i - 80), i + 120)}…
эталон: …${b.slice(Math.max(0, i - 80), i + 120)}…`
    expect(a === b, at).toBe(true)
  })
})
