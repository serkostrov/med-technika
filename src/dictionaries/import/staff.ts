import {
  cellStr,
  hasBlockingIssues,
  type ExcelRow,
  type ImportIssue,
  type ImportPreviewBase,
} from './types'
import { normalizeText } from '@/dictionaries/normalize/text'

export type StaffParsedRow = {
  row: number
  surname: string
  fullName: string
  shortName: string
  fgisIdFullName: number | null
  postName: string | null
  fgisRoleIds: number[]
}

export type StaffImportPreview = ImportPreviewBase & {
  kind: 'staff'
  rows: StaffParsedRow[]
}

export function previewStaffImport(
  rows: ExcelRow[],
  sourceFile: string | null = null,
): StaffImportPreview {
  const issues: ImportIssue[] = []
  const parsed: StaffParsedRow[] = []
  const seenIds = new Set<number>()

  rows.forEach((row, idx) => {
    const rowNum = idx + 2
    const surname = cellStr(row, 'фамилия', 'Фамилия')
    const fullName =
      cellStr(row, 'фио', 'ФИО', 'полное имя', 'full_name') || surname
    const shortName =
      cellStr(row, 'краткое имя', 'short_name') ||
      (surname ? `${surname}` : '')
    const idRaw = cellStr(row, 'idfullname', 'idFullName', 'id')
    const postName = cellStr(row, 'должность', 'post', 'PostName') || null
    const roleRaw = cellStr(row, 'роль', 'роль фгис', 'idRoleName')

    if (!surname && !fullName && !idRaw) return

    if (!surname && !fullName) {
      issues.push({
        row: rowNum,
        field: 'фамилия',
        code: 'REQUIRED',
        severity: 'error',
        message: 'Пустая фамилия / ФИО',
      })
    }

    let fgisIdFullName: number | null = null
    if (idRaw) {
      const n = Number(idRaw)
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        issues.push({
          row: rowNum,
          field: 'idFullName',
          code: 'INVALID_ID',
          severity: 'error',
          message: `Некорректный idFullName: ${idRaw}`,
        })
      } else {
        fgisIdFullName = n
        if (seenIds.has(n)) {
          issues.push({
            row: rowNum,
            field: 'idFullName',
            code: 'DUPLICATE',
            severity: 'error',
            message: `Дубликат idFullName: ${n}`,
          })
        }
        seenIds.add(n)
      }
    } else {
      issues.push({
        row: rowNum,
        field: 'idFullName',
        code: 'REQUIRED',
        severity: 'warning',
        message: 'Нет idFullName — E06 при использовании как исполнителя',
      })
    }

    const fgisRoleIds = roleRaw
      ? roleRaw
          .split(/[,;\s]+/)
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n))
      : [1]

    parsed.push({
      row: rowNum,
      surname: normalizeText(surname || fullName.split(/\s+/)[0] || ''),
      fullName: normalizeText(fullName),
      shortName: normalizeText(shortName || fullName),
      fgisIdFullName,
      postName,
      fgisRoleIds: fgisRoleIds.length ? fgisRoleIds : [1],
    })
  })

  if (parsed.length === 0) {
    issues.push({
      row: 0,
      code: 'EMPTY',
      severity: 'error',
      message: 'Нет строк персонала',
    })
  }

  return {
    kind: 'staff',
    sourceFile,
    rowCount: parsed.length,
    issues,
    canCommit: !hasBlockingIssues(issues) && parsed.length > 0,
    rows: parsed,
  }
}
