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
  const readyOrKnown = forms.filter(
    (f) =>
      f.status === FormStatus.ready ||
      f.status === FormStatus.in_progress ||
      f.parserProfile === 'physio-bb' ||
      f.parserProfile === 'physio-df',
  )

  const candidates: FormCandidate[] = []

  for (const grid of grids) {
    if (sheetLooksService(grid.name)) continue
    const sheetNorm = normalizeSheetName(grid.name)
    const form = readyOrKnown.find(
      (f) => normalizeSheetName(f.sheetName) === sheetNorm,
    )
    if (!form) continue

    // Профили без материалов не разбираем, кроме ready
    if (form.status === FormStatus.no_materials) continue
    if (
      form.parserProfile !== 'physio-bb' &&
      form.parserProfile !== 'physio-df'
    ) {
      // архитектурная точка расширения — не имитируем
      continue
    }

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
