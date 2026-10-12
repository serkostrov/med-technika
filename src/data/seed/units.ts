import type { Unit, UnitConversion } from '@/domain'

/** Единицы из эталонных сопоставлений ТЗ §7.4 — без полного справочника ФСА. */
export const SEED_UNITS: readonly Unit[] = [
  { fgisId: '42', name: 'ватт', symbol: 'Вт' },
  { fgisId: '70', name: 'мегагерц', symbol: 'МГц' },
  { fgisId: '68', name: 'герц', symbol: 'Гц' },
  { fgisId: '716', name: 'миллиампер', symbol: 'мА' },
  { fgisId: '58', name: 'джоуль', symbol: 'Дж' },
  { fgisId: '96', name: 'секунда', symbol: 'с' },
]

/** Начальный набор пересчётов ТЗ §7.5. */
export const SEED_UNIT_CONVERSIONS: readonly UnitConversion[] = [
  { fromSymbol: 'кГц', toSymbol: 'Гц', factor: 1e3 },
  { fromSymbol: 'МГц', toSymbol: 'Гц', factor: 1e6 },
  { fromSymbol: 'ГГц', toSymbol: 'Гц', factor: 1e9 },
  { fromSymbol: 'мА', toSymbol: 'А', factor: 1e-3 },
  { fromSymbol: 'мВт', toSymbol: 'Вт', factor: 1e-3 },
  { fromSymbol: 'кВт', toSymbol: 'Вт', factor: 1e3 },
  { fromSymbol: 'мкГр', toSymbol: 'Гр', factor: 1e-6 },
  { fromSymbol: 'мГр', toSymbol: 'Гр', factor: 1e-3 },
  { fromSymbol: 'мкЗв/ч', toSymbol: 'Зв/ч', factor: 1e-6 },
  { fromSymbol: 'мЗв/ч', toSymbol: 'Зв/ч', factor: 1e-3 },
  { fromSymbol: 'мс', toSymbol: 'с', factor: 1e-3 },
]
