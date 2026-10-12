/**
 * Разделение слоёв значений (ТЗ §2, §6.5, §6.6).
 * Не смешивать между собой.
 */

/** Сырые 4 замера из Excel (BB:BE) — double */
export type ExcelRawMeasurements = number[]

/** Среднее / U, прочитанные из Excel (BF / BJ и аналоги) */
export type ExcelComputed = {
  avg: number | null
  U: number | null
}

/** Отображаемое число из ячейки протокола (AK / Y) до форматирования FactValue */
export type ExcelDisplayValue = {
  value: number | null
  numberFormat: string | null
}

/** Серверный пересчёт по §6.5 — не уходит во ФГИС */
export type ServerRecalc = {
  avg: number
  uA: number
  uB: number
  u: number
  U: number
}

/**
 * FactValue — строка для XML ФГИС (§6.6).
 * Источник: ExcelDisplayValue, НЕ ServerRecalc.
 */
export type FactValueText = string

export type MeasurementValueLayers = {
  raw: ExcelRawMeasurements | null
  excel: ExcelComputed
  display: ExcelDisplayValue
  recalc: ServerRecalc | null
  factValue: FactValueText
}
