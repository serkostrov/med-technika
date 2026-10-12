import type { Unit, UnitConversion } from '@/domain'
import { canConvert, tryConvert } from '@/dictionaries/units/convert'

export type UnitMatch = {
  excelUnit: Unit | null
  oaUnitSymbol: string | null
  convertible: boolean
  convertedValue: number | null
}

/**
 * Единица Excel → единица ОА через units + unit_conversions (ТЗ §7.5).
 * Отсутствие единицы или пересчёта → E15.
 */
export function matchUnit(
  units: readonly Unit[],
  conversions: readonly UnitConversion[],
  excelSymbol: string | null | undefined,
  oaUnitSymbol: string | null | undefined,
  value: number | null,
): UnitMatch {
  if (!excelSymbol) {
    return {
      excelUnit: null,
      oaUnitSymbol: oaUnitSymbol ?? null,
      convertible: false,
      convertedValue: null,
    }
  }

  const excelUnit = units.find((u) => u.symbol === excelSymbol) ?? null
  const target = oaUnitSymbol ?? excelSymbol

  if (!excelUnit) {
    return {
      excelUnit: null,
      oaUnitSymbol: target,
      convertible: false,
      convertedValue: null,
    }
  }

  const convertible = canConvert(excelSymbol, target, conversions)
  const convertedValue =
    value != null && convertible
      ? tryConvert(value, excelSymbol, target, conversions)
      : null

  return { excelUnit, oaUnitSymbol: target, convertible, convertedValue }
}
