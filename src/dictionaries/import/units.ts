import { normalizeText } from '@/dictionaries/normalize/text'
import {
  cellStr,
  hasBlockingIssues,
  type ExcelRow,
  type ImportIssue,
  type ImportPreviewBase,
} from './types'

export type UnitParsedRow = {
  row: number
  fgisId: string
  name: string | null
  symbol: string
}

export type UnitsImportPreview = ImportPreviewBase & {
  kind: 'units'
  rows: UnitParsedRow[]
}

export function previewUnitsImport(
  rows: ExcelRow[],
  sourceFile: string | null = null,
): UnitsImportPreview {
  const issues: ImportIssue[] = []
  const parsed: UnitParsedRow[] = []
  const seenIds = new Set<string>()
  const seenSymbols = new Map<string, string>()

  rows.forEach((row, idx) => {
    const rowNum = idx + 2
    const fgisId = cellStr(row, 'id', 'ID', 'fgis_id')
    const name = cellStr(row, 'наименование', 'name') || null
    const symbol = cellStr(row, 'обозначение', 'символ', 'symbol')

    if (!fgisId && !symbol) return

    if (!fgisId) {
      issues.push({
        row: rowNum,
        field: 'id',
        code: 'REQUIRED',
        severity: 'error',
        message: 'Пустой ID единицы ФГИС',
      })
    }
    if (!symbol) {
      issues.push({
        row: rowNum,
        field: 'обозначение',
        code: 'REQUIRED',
        severity: 'error',
        message: 'Пустое обозначение единицы',
      })
    }

    if (fgisId && seenIds.has(fgisId)) {
      issues.push({
        row: rowNum,
        field: 'id',
        code: 'DUPLICATE',
        severity: 'error',
        message: `Дубликат ID единицы: ${fgisId}`,
      })
    }
    if (fgisId) seenIds.add(fgisId)

    if (symbol) {
      const prev = seenSymbols.get(symbol)
      if (prev && prev !== fgisId) {
        issues.push({
          row: rowNum,
          field: 'обозначение',
          code: 'CONFLICT',
          severity: 'warning',
          message: `Конфликт обозначения «${symbol}»: ID ${prev} и ${fgisId}`,
        })
      }
      seenSymbols.set(symbol, fgisId)
    }

    parsed.push({
      row: rowNum,
      fgisId,
      name: name ? normalizeText(name) : null,
      symbol: normalizeText(symbol),
    })
  })

  if (parsed.length === 0) {
    issues.push({
      row: 0,
      code: 'EMPTY',
      severity: 'error',
      message: 'Нет строк единиц измерения',
    })
  }

  return {
    kind: 'units',
    sourceFile,
    rowCount: parsed.length,
    issues,
    canCommit: !hasBlockingIssues(issues) && parsed.length > 0,
    rows: parsed,
  }
}
