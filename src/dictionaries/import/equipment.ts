import { EquipmentKind, type EquipmentKind as EqKind } from '@/domain'
import { normalizeSerial, normalizeText } from '@/dictionaries/normalize/text'
import {
  cellStr,
  hasBlockingIssues,
  type ExcelRow,
  type ImportIssue,
  type ImportPreviewBase,
} from './types'

export type EquipmentParsedRow = {
  row: number
  name: string
  serialNo: string | null
  serialNorm: string | null
  invNo: string | null
  fgisEquipmentId: number | null
  kind: EqKind
}

export type EquipmentImportPreview = ImportPreviewBase & {
  kind: 'equipment'
  rows: EquipmentParsedRow[]
}

function parseKind(raw: string): EqKind {
  const v = raw.toLowerCase()
  if (v.includes('вспомог') || v === 'aux') return EquipmentKind.aux
  if (v.includes('испытат') || v === 'test') return EquipmentKind.test
  return EquipmentKind.si
}

export function previewEquipmentImport(
  rows: ExcelRow[],
  sourceFile: string | null = null,
): EquipmentImportPreview {
  const issues: ImportIssue[] = []
  const parsed: EquipmentParsedRow[] = []
  const seenEquipmentIds = new Set<number>()
  const seenSerials = new Set<string>()

  rows.forEach((row, idx) => {
    const rowNum = idx + 2
    const name = cellStr(row, 'наименование', 'Наименование', 'name')
    const serialNo =
      cellStr(row, 'зав. №', 'зав.№', 'серийный номер', 'serial', 'serial_no') ||
      null
    const invNo =
      cellStr(row, 'инв. №', 'инв.№', 'инвентарный номер', 'inv_no') || null
    const idRaw = cellStr(row, 'equipmentid', 'EquipmentId', 'id оборудования')
    const kindRaw = cellStr(row, 'вид', 'тип', 'kind')

    if (!name && !serialNo && !idRaw) return

    if (!name) {
      issues.push({
        row: rowNum,
        field: 'наименование',
        code: 'REQUIRED',
        severity: 'error',
        message: 'Пустое наименование оборудования',
      })
    }

    let fgisEquipmentId: number | null = null
    if (idRaw) {
      const n = Number(idRaw)
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        issues.push({
          row: rowNum,
          field: 'EquipmentId',
          code: 'INVALID_ID',
          severity: 'error',
          message: `Некорректный EquipmentId: ${idRaw}`,
        })
      } else {
        fgisEquipmentId = n
        if (seenEquipmentIds.has(n)) {
          issues.push({
            row: rowNum,
            field: 'EquipmentId',
            code: 'DUPLICATE',
            severity: 'error',
            message: `Дубликат EquipmentId: ${n}`,
          })
        }
        seenEquipmentIds.add(n)
      }
    } else {
      issues.push({
        row: rowNum,
        field: 'EquipmentId',
        code: 'REQUIRED',
        severity: 'warning',
        message: 'Нет EquipmentId — E04 при привязке к протоколу',
      })
    }

    const serialNorm = serialNo ? normalizeSerial(serialNo) : null
    if (serialNorm) {
      if (seenSerials.has(serialNorm)) {
        issues.push({
          row: rowNum,
          field: 'serial',
          code: 'DUPLICATE',
          severity: 'warning',
          message: `Повтор serial_norm в файле: ${serialNorm}`,
        })
      }
      seenSerials.add(serialNorm)
    }

    parsed.push({
      row: rowNum,
      name: normalizeText(name),
      serialNo,
      serialNorm,
      invNo,
      fgisEquipmentId,
      kind: kindRaw ? parseKind(kindRaw) : EquipmentKind.si,
    })
  })

  if (parsed.length === 0) {
    issues.push({
      row: 0,
      code: 'EMPTY',
      severity: 'error',
      message: 'Нет строк оборудования',
    })
  }

  return {
    kind: 'equipment',
    sourceFile,
    rowCount: parsed.length,
    issues,
    canCommit: !hasBlockingIssues(issues) && parsed.length > 0,
    rows: parsed,
  }
}
