import type { Unit, UnitConversion } from '@/domain'

/** Единицы из эталонных сопоставлений ТЗ §7.4 — без полного справочника ФСА. */
export const SEED_UNITS: readonly Unit[] = [
  { fgisId: '42', name: 'ватт', symbol: 'Вт' },
  { fgisId: '70', name: 'мегагерц', symbol: 'МГц' },
  { fgisId: '68', name: 'герц', symbol: 'Гц' },
  { fgisId: '716', name: 'миллиампер', symbol: 'мА' },
  { fgisId: '58', name: 'джоуль', symbol: 'Дж' },
  { fgisId: '96', name: 'секунда', symbol: 'с' },
  // 26-Ш: MeasurementId 429 из эталонной выгрузки 29-26-Ш
  { fgisId: '429', name: 'децибел А', symbol: 'дБА' },
  // 26-ПЧ: MeasurementId из эталона 52-26-ПЧ
  { fgisId: '993', name: 'нанотесла', symbol: 'нТл' },
  { fgisId: '555', name: 'вольт на метр', symbol: 'В/м' },
  // 26-О: эталон 150-26-О
  { fgisId: '64', name: 'люкс', symbol: 'лк' },
  { fgisId: '292', name: 'процент', symbol: '%' },
  // 26-МК: эталон 204-26-МК
  { fgisId: '61', name: 'градус Цельсия', symbol: '°С' },
  { fgisId: '90', name: 'метр в секунду', symbol: 'м/с' },
  // 26-АС: эталон 260-26-АС
  { fgisId: '110', name: 'кубический метр в час', symbol: 'м3/ч' },
  { fgisId: '1197', name: 'в час', symbol: 'час-1' },
  // 26-СЗ: эталон 125-26-СЗ
  { fgisId: '743', name: 'миллиметр свинца', symbol: 'мм Pb' },
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
