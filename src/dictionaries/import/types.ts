import type { EntityId } from '@/domain'

export type ImportIssueSeverity = 'error' | 'warning'

export type ImportIssue = {
  row: number
  field?: string
  code: string
  severity: ImportIssueSeverity
  message: string
}

export type ImportPreviewBase = {
  sourceFile: string | null
  rowCount: number
  issues: ImportIssue[]
  canCommit: boolean
}

export type AuditWriter = (
  entity: string,
  entityId: EntityId | null,
  action: string,
  diff: Record<string, unknown> | null,
) => void

/** Строка Excel как словарь заголовок → значение (после SheetJS). */
export type ExcelRow = Record<string, unknown>

export function cellStr(row: ExcelRow, ...keys: string[]): string {
  for (const key of keys) {
    const direct = row[key]
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
      return String(direct).trim()
    }
    const found = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === key.trim().toLowerCase(),
    )
    if (found) {
      const v = row[found]
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v).trim()
      }
    }
  }
  return ''
}

/**
 * Значение первой колонки, заголовок которой начинается с одного из префиксов
 * (без учёта регистра): «Наименование оборудования», «Наименование СИ, тип» …
 * Колонки из `exclude` пропускаются.
 */
export function cellStrByPrefix(
  row: ExcelRow,
  prefixes: readonly string[],
  exclude: readonly string[] = [],
): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const excluded = exclude.map(norm)
  for (const prefix of prefixes.map(norm)) {
    const found = Object.keys(row).find((k) => {
      const nk = norm(k)
      return nk.startsWith(prefix) && !excluded.some((e) => nk.startsWith(e))
    })
    if (found) {
      const v = row[found]
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v).trim()
      }
    }
  }
  return ''
}

export function hasBlockingIssues(issues: readonly ImportIssue[]): boolean {
  return issues.some((i) => i.severity === 'error')
}
