import { OaEditionKind, type OaEditionKind as OaKind } from '@/domain'
import { parseFgisTaggedText, parseOaRange } from '@/dictionaries/normalize/fgis-text'
import { normalizeText } from '@/dictionaries/normalize/text'
import {
  cellStr,
  hasBlockingIssues,
  type ExcelRow,
  type ImportIssue,
  type ImportPreviewBase,
} from './types'

export type OaParsedItem = {
  row: number
  itemNo: string
  methodikText: string
  methodikFgisId: number | null
  methodText: string | null
  methodFgisId: number | null
  objectType: string | null
  indicatorText: string
  indicatorFgisId: string | null
  unitText: string | null
  unitFgisId: string | null
  rangeText: string | null
  rangeMin: number | null
  rangeMax: number | null
  isCalculated: boolean
  objectName: string | null
}

export type OaSegmentPreview = {
  index: number
  startRow: number
  endRow: number
  itemCount: number
  firstItemNo: string
  lastItemNo: string
  /** Пользователь должен назначить current | extension */
  suggestedKind: OaKind | null
  items: OaParsedItem[]
}

export type OaImportPreview = ImportPreviewBase & {
  kind: 'oa'
  segments: OaSegmentPreview[]
  needsKindAssignment: boolean
}

function itemNoParts(itemNo: string): number[] {
  return itemNo
    .trim()
    .replace(/\.+$/, '')
    .split('.')
    .map((p) => Number(p))
    .filter((n) => Number.isFinite(n))
}

/**
 * Перезапуск нумерации: следующая строка снова «1.1» / «1.1.»
 * после пунктов, уже ушедших дальше первой позиции (ТЗ §12).
 */
export function isOaRenumberRestart(prevItemNo: string, nextItemNo: string): boolean {
  const next = nextItemNo.trim()
  if (!/^1\.1\.?$/.test(next)) return false
  const prev = itemNoParts(prevItemNo)
  if (prev.length === 0) return false
  if (prev[0] === 1 && (prev[1] ?? 0) <= 1) return false
  return true
}

/**
 * Распознавание перезапуска нумерации (ТЗ §12):
 * когда пункт снова начинается с 1.1 после больших номеров.
 */
export function splitOaSegments(items: OaParsedItem[]): OaSegmentPreview[] {
  if (items.length === 0) return []

  const segments: OaParsedItem[][] = []
  let current: OaParsedItem[] = [items[0]!]

  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!
    const next = items[i]!
    if (isOaRenumberRestart(prev.itemNo, next.itemNo)) {
      segments.push(current)
      current = [next]
    } else {
      current.push(next)
    }
  }
  segments.push(current)

  return segments.map((seg, index) => ({
    index,
    startRow: seg[0]!.row,
    endRow: seg[seg.length - 1]!.row,
    itemCount: seg.length,
    firstItemNo: seg[0]!.itemNo,
    lastItemNo: seg[seg.length - 1]!.itemNo,
    suggestedKind:
      segments.length === 2
        ? index === 0
          ? OaEditionKind.current
          : OaEditionKind.extension
        : null,
    items: seg,
  }))
}

export function previewOaImport(
  rows: ExcelRow[],
  sourceFile: string | null = null,
): OaImportPreview {
  const issues: ImportIssue[] = []
  const items: OaParsedItem[] = []

  rows.forEach((row, idx) => {
    const rowNum = idx + 2 // заголовок = строка 1
    const itemNo = cellStr(row, 'пункт', 'Пункт', 'item_no')
    const methodikRaw = cellStr(row, 'методика', 'Методика')
    const methodRaw = cellStr(row, 'метод', 'Метод')
    const objectType = cellStr(row, 'тип объекта', 'Тип объекта') || null
    const indicatorRaw = cellStr(row, 'показатель', 'Показатель')
    const unitRaw = cellStr(row, 'единица', 'Единица')
    const rangeText = cellStr(row, 'диапазон', 'Диапазон') || null
    const objectName =
      cellStr(row, 'наименование объекта', 'Наименование объекта') || null

    if (!itemNo && !indicatorRaw && !methodikRaw) {
      return // пустая строка
    }

    if (!itemNo) {
      issues.push({
        row: rowNum,
        field: 'пункт',
        code: 'REQUIRED',
        severity: 'error',
        message: 'Пустой обязательный пункт ОА',
      })
    }
    if (!indicatorRaw) {
      issues.push({
        row: rowNum,
        field: 'показатель',
        code: 'REQUIRED',
        severity: 'error',
        message: 'Пустой обязательный показатель',
      })
    }
    if (!methodikRaw) {
      issues.push({
        row: rowNum,
        field: 'методика',
        code: 'REQUIRED',
        severity: 'error',
        message: 'Пустая обязательная методика',
      })
    }

    const methodik = parseFgisTaggedText(methodikRaw)
    const method = parseFgisTaggedText(methodRaw)
    const indicator = parseFgisTaggedText(indicatorRaw)
    const unit = parseFgisTaggedText(unitRaw)
    const range = rangeText ? parseOaRange(rangeText) : { min: null, max: null }

    const isCalculated = /расчетн/i.test(indicator.text) || /расчётн/i.test(indicator.text)

    if (indicator.id !== null && !/^\d+$/.test(indicator.id) && !indicator.isAbsent) {
      issues.push({
        row: rowNum,
        field: 'показатель',
        code: 'INVALID_ID',
        severity: 'error',
        message: `Некорректный ID показателя: ${indicator.id}`,
      })
    }

    items.push({
      row: rowNum,
      itemNo: normalizeText(itemNo),
      methodikText: methodik.text,
      methodikFgisId: methodik.id ? Number(methodik.id) : null,
      methodText: method.text || null,
      methodFgisId: method.id ? Number(method.id) : null,
      objectType,
      indicatorText: indicator.text,
      indicatorFgisId: indicator.id,
      unitText: unit.text || null,
      unitFgisId: unit.id,
      rangeText,
      rangeMin: range.min,
      rangeMax: range.max,
      isCalculated,
      objectName,
    })
  })

  if (items.length === 0) {
    issues.push({
      row: 0,
      code: 'EMPTY',
      severity: 'error',
      message: 'Нет строк ОА для импорта',
    })
  }

  const segments = splitOaSegments(items)
  const needsKindAssignment =
    segments.length > 1 && segments.some((s) => s.suggestedKind === null)

  if (segments.length > 1) {
    issues.push({
      row: segments[1]!.startRow,
      code: 'OA_RENUMBER',
      severity: 'warning',
      message: `Обнаружен перезапуск нумерации (${segments.length} частей). Назначьте вид каждой редакции (current / extension).`,
    })
  }

  return {
    kind: 'oa',
    sourceFile,
    rowCount: items.length,
    issues,
    canCommit: !hasBlockingIssues(issues) && items.length > 0,
    segments,
    needsKindAssignment,
  }
}
