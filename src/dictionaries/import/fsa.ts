import {
  cellStr,
  hasBlockingIssues,
  type ExcelRow,
  type ImportIssue,
  type ImportPreviewBase,
} from './types'
import { normalizeText } from '@/dictionaries/normalize/text'

export type FsaCatalog =
  | 'indicators'
  | 'docs'
  | 'methods'
  | 'vvf'
  | 'harmful'

export type FsaParsedRow = {
  row: number
  id: string
  name: string
  isActual: boolean
  catalog: FsaCatalog
}

export type FsaImportPreview = ImportPreviewBase & {
  kind: 'fsa'
  catalog: FsaCatalog
  rows: FsaParsedRow[]
}

/**
 * Опциональный импорт справочников ФСА (ТЗ §12) — не блокирует работу.
 */
export function previewFsaImport(
  rows: ExcelRow[],
  catalog: FsaCatalog,
  sourceFile: string | null = null,
): FsaImportPreview {
  const issues: ImportIssue[] = []
  const parsed: FsaParsedRow[] = []
  const seen = new Set<string>()

  rows.forEach((row, idx) => {
    const rowNum = idx + 2
    const id = cellStr(row, 'id', 'ID')
    const name = cellStr(row, 'name', 'наименование', 'название')
    const actualRaw = cellStr(row, 'is_actual', 'актуален', 'actual')

    if (!id && !name) return

    if (!id) {
      issues.push({
        row: rowNum,
        field: 'id',
        code: 'REQUIRED',
        severity: 'error',
        message: 'Пустой ID ФСА',
      })
    }
    if (!name) {
      issues.push({
        row: rowNum,
        field: 'name',
        code: 'REQUIRED',
        severity: 'error',
        message: 'Пустое наименование ФСА',
      })
    }
    if (id && seen.has(id)) {
      issues.push({
        row: rowNum,
        field: 'id',
        code: 'DUPLICATE',
        severity: 'error',
        message: `Дубликат ID ФСА: ${id}`,
      })
    }
    if (id) seen.add(id)

    const isActual =
      actualRaw === '' ||
      /^(1|true|да|y|yes)$/i.test(actualRaw) ||
      actualRaw === '1'

    parsed.push({
      row: rowNum,
      id,
      name: normalizeText(name),
      isActual,
      catalog,
    })
  })

  if (parsed.length === 0) {
    issues.push({
      row: 0,
      code: 'EMPTY',
      severity: 'error',
      message: 'Нет строк справочника ФСА',
    })
  }

  return {
    kind: 'fsa',
    catalog,
    sourceFile,
    rowCount: parsed.length,
    issues,
    canCommit: !hasBlockingIssues(issues) && parsed.length > 0,
    rows: parsed,
  }
}
