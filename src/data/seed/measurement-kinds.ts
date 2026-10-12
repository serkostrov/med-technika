import type { MeasurementKind } from '@/domain'

/**
 * Виды измерений по Приложению Б ТЗ (шаблоны лаборатории).
 * suffix — по системе менеджмента ИЛ (§6.2), где указан явно.
 */
export const SEED_MEASUREMENT_KINDS: readonly MeasurementKind[] = [
  { id: 1, code: '26-MT', title: 'Физиотерапия и смежное (26-МТ)', suffix: 'МТ' },
  { id: 2, code: '26-EP', title: 'Рентгеновские аппараты (26-ЭП)', suffix: 'ЭП' },
  { id: 3, code: '26-EP-CT', title: 'КТ (26-ЭП КТ)', suffix: 'ЭП' },
  { id: 4, code: '26-ED', title: 'Дозиметрия (26-ЭД)', suffix: 'ЭД' },
  { id: 5, code: '26-RK', title: 'Радиационный контроль (26-РК)', suffix: 'РК' },
  { id: 6, code: '26-SZ', title: 'Средства защиты (26-СЗ)', suffix: 'СЗ' },
  { id: 7, code: '26-IDK', title: 'ИДК (26-ИДК)', suffix: 'ИДК' },
  { id: 8, code: '26-AS', title: 'Вентиляция / АС (26-АС)', suffix: 'АС' },
  { id: 9, code: '26-MK', title: 'Микроклимат (26-МК)', suffix: 'МК' },
  { id: 10, code: '26-O', title: 'Освещённость (26-О)', suffix: 'О' },
  { id: 11, code: '26-PP', title: 'ЭМП (26-ПП)', suffix: 'ПП' },
  { id: 12, code: '26-PCH', title: 'ЭМП (26-ПЧ)', suffix: 'ПЧ' },
  { id: 13, code: '26-SH', title: 'Шум (26-Ш)', suffix: 'Ш' },
]
