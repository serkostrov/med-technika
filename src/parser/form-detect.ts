import type { ProtocolForm } from '@/domain'
import { FormStatus } from '@/domain'
import {
  PROTOCOL_LINE_RE,
  cellText,
  isTemplateProtocolNumber,
  normalizeSheetName,
  parseRuDate,
  sheetLooksService,
  type SheetGrid,
} from './sheet-utils'
import type { FormCandidate, FormDetectionResult } from './types'
import { isImplementedProfile } from './profiles/registry'

function extractProtocolLine(
  grid: SheetGrid,
): { number: string; protocolDate: string } | null {
  for (let r = 0; r <= Math.min(grid.maxRow, 80); r++) {
    // якорь может быть в A или растянут — склеиваем строку A..P
    let line = ''
    for (let c = 0; c <= 20; c++) {
      const t = cellText(grid, r, c)
      if (t) line += (line ? ' ' : '') + t
    }
    const m = PROTOCOL_LINE_RE.exec(line)
    if (!m) continue
    const number = m[1]!
    const protocolDate = parseRuDate(m[2]!)
    if (!protocolDate || isTemplateProtocolNumber(number)) continue
    return { number, protocolDate }
  }
  return null
}

/**
 * Определение формы (ТЗ §6.2).
 */
export function detectForm(
  grids: SheetGrid[],
  forms: readonly ProtocolForm[],
  preferredSheetName?: string | null,
): FormDetectionResult {
  // все формы справочника: заполненный лист формы без материалов должен «перебить»
  // шаблонные листы готовых форм с номером-заглушкой (262-26-АС: заполнен
  // «Протокол МР 4.3.0212-20», а «(LITE)» — шаблон «1-26-АС от 10.01.2026»);
  // разбор такой формы потом честно отказывает «нет материалов»
  const readyOrKnown = forms

  const candidates: FormCandidate[] = []

  for (const grid of grids) {
    if (sheetLooksService(grid.name)) continue
    const sheetNorm = normalizeSheetName(grid.name)
    // одно имя листа бывает в двух шаблонах (26-ЭД обычный / расширенный:
    // «Дентальный_», «КТ_»…) — берём готовую форму с реализованным профилем
    const sameSheet = readyOrKnown.filter(
      (f) => normalizeSheetName(f.sheetName) === sheetNorm,
    )
    const form =
      sameSheet.find(
        (f) => f.status !== FormStatus.no_materials && isImplementedProfile(f.parserProfile),
      ) ?? sameSheet[0]
    if (!form) continue

    const proto = extractProtocolLine(grid)
    if (!proto) continue

    candidates.push({
      formId: form.id,
      sheetName: grid.name,
      title: form.title,
      parserProfile: form.parserProfile,
      status: form.status,
      number: proto.number,
      protocolDate: proto.protocolDate,
      numberSuffix:
        typeof form.settings.numberSuffix === 'string'
          ? form.settings.numberSuffix
          : null,
    })
  }

  if (preferredSheetName) {
    const preferred = candidates.find(
      (c) => normalizeSheetName(c.sheetName) === normalizeSheetName(preferredSheetName),
    )
    if (preferred) {
      return { ok: true, candidate: preferred, alternatives: candidates }
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      reason:
        'Файл не распознан: не найден лист формы с заполненной строкой «Протокол № … от …»',
      alternatives: [],
    }
  }

  if (candidates.length === 1) {
    return { ok: true, candidate: candidates[0]!, alternatives: candidates }
  }

  // неоднозначность: на шаблонных листах бывает «живой» номер-заглушка
  // («1-26-РК от 01.01.2026», «1-25-ЭД от 09.01.2025») — берём единственный
  // лист с самой поздней датой протокола (эталоны 324-26-РК, 272-26-ЭД)
  const latest = candidates.reduce((m, c) => (c.protocolDate > m ? c.protocolDate : m), '')
  const newest = candidates.filter((c) => c.protocolDate === latest)
  if (newest.length === 1) {
    return { ok: true, candidate: newest[0]!, alternatives: candidates }
  }

  // неоднозначность — суффикс номера
  const bySuffix = candidates.filter((c) => {
    if (!c.numberSuffix) return false
    return c.number.toUpperCase().includes(c.numberSuffix.toUpperCase())
  })
  if (bySuffix.length === 1) {
    return { ok: true, candidate: bySuffix[0]!, alternatives: candidates }
  }

  return {
    ok: false,
    reason:
      'Файл не распознан однозначно: несколько заполненных форм. Укажите лист.',
    alternatives: candidates,
  }
}
