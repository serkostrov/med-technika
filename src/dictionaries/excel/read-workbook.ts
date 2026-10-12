import type * as XLSNS from 'xlsx'
import type { ExcelRow } from '@/dictionaries/import/types'

let xlsxModule: typeof XLSNS | null = null

async function getXlsx(): Promise<typeof XLSNS> {
  if (!xlsxModule) {
    xlsxModule = await import('xlsx')
  }
  return xlsxModule
}

/**
 * Чтение xlsx/xls в браузере (SheetJS) → массив строк-объектов по заголовкам.
 * Запись в БД не выполняется — только предпросмотр (ТЗ §3, §12).
 */
export async function readExcelSheetRows(
  data: ArrayBuffer,
  sheetName?: string,
): Promise<{ sheetName: string; rows: ExcelRow[]; sheetNames: string[] }> {
  const XLSX = await getXlsx()
  const workbook = XLSX.read(data, { type: 'array', cellDates: true })
  const names = workbook.SheetNames
  const chosen = sheetName && names.includes(sheetName) ? sheetName : names[0]
  if (!chosen) {
    return { sheetName: '', rows: [], sheetNames: names }
  }
  const sheet = workbook.Sheets[chosen]
  if (!sheet) {
    return { sheetName: chosen, rows: [], sheetNames: names }
  }
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, {
    defval: '',
    raw: false,
  })
  return { sheetName: chosen, rows, sheetNames: names }
}
