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
  { fgisId: '991', name: 'киловольт на метр', symbol: 'кВ/м' },
  { fgisId: '719', name: 'микротесла', symbol: 'мкТл' },
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
  // 26-ЭП: эталон 426-26-ЭП (обозначения — как в протоколе)
  { fgisId: '739', name: 'миллиметр алюминия', symbol: 'мм Al' },
  { fgisId: '663', name: 'единица Хаунсфилда', symbol: 'HU' },
  { fgisId: '1353', name: 'пар линий на сантиметр', symbol: 'пар линий/см' },
  { fgisId: '688', name: 'миллигрей', symbol: 'мГр' },
  { fgisId: '46', name: 'киловольт', symbol: 'кВ' },
  { fgisId: '742', name: 'миллигрей-квадратный метр на миллиампер-секунду', symbol: 'мГр·м²/(мА·с)' },
  { fgisId: '749', name: 'миллигрей в час', symbol: 'мГр/ч' },
  { fgisId: '740', name: 'пара линий на миллиметр', symbol: 'пар лин./мм' },
  { fgisId: '1', name: 'миллиметр', symbol: 'мм' },
  { fgisId: '738', name: 'миллиампер-секунда', symbol: 'мАс' },
  { fgisId: '133', name: 'штука', symbol: 'шт' },
  // 26-РК: эталон 328-26-РК
  { fgisId: '684', name: 'микрозиверт в час', symbol: 'мкЗв/ч' },
  // 26-ЭД: эталон 272-26-ЭД
  { fgisId: '811', name: 'миллизиверт', symbol: 'мЗв' },
  // 26-МТ: эталоны 57-26-МТ, 4-26-Ц
  { fgisId: '995', name: 'миллитесла', symbol: 'мТл' },
  { fgisId: '92', name: 'оборот в минуту', symbol: 'об/мин' },
  { fgisId: '819', name: 'наносекунда', symbol: 'нс' },
  // 26-МТ ИВЛ: эталон 5-26-ИВЛ
  { fgisId: '73', name: 'килопаскаль', symbol: 'кПа' },
  { fgisId: '613', name: 'литр', symbol: 'л' },
  { fgisId: '1164', name: 'литр в минуту', symbol: 'л/мин' },
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
