import type { UnitConversion } from '@/domain'

/** «шт.» = «шт», «пар лин./мм.» = «пар лин./мм»: точка в конце — пунктуация ОА. */
export function unitKey(symbol: string): string {
  return symbol.trim().replace(/\.+$/, '').replace(/\s+/g, ' ')
}

function sameUnit(a: string, b: string): boolean {
  return unitKey(a) === unitKey(b)
}

/**
 * Пересчёт значения между единицами через unit_conversions (ТЗ §7.5).
 * Одинаковые символы → factor 1. Прямой или обратный коэффициент.
 */
export function convert(
  value: number,
  fromSymbol: string,
  toSymbol: string,
  conversions: readonly UnitConversion[],
): number {
  if (sameUnit(fromSymbol, toSymbol)) return value
  const direct = conversions.find(
    (c) => c.fromSymbol === fromSymbol && c.toSymbol === toSymbol,
  )
  if (direct) return value * direct.factor
  const inverse = conversions.find(
    (c) => c.fromSymbol === toSymbol && c.toSymbol === fromSymbol,
  )
  if (inverse) return value / inverse.factor
  throw new Error(`Нет пересчёта ${fromSymbol} → ${toSymbol}`)
}

export function canConvert(
  fromSymbol: string,
  toSymbol: string,
  conversions: readonly UnitConversion[],
): boolean {
  if (sameUnit(fromSymbol, toSymbol)) return true
  return conversions.some(
    (c) =>
      (c.fromSymbol === fromSymbol && c.toSymbol === toSymbol) ||
      (c.fromSymbol === toSymbol && c.toSymbol === fromSymbol),
  )
}

export function tryConvert(
  value: number,
  fromSymbol: string,
  toSymbol: string,
  conversions: readonly UnitConversion[],
): number | null {
  try {
    return convert(value, fromSymbol, toSymbol, conversions)
  } catch {
    return null
  }
}
