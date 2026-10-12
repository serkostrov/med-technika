/** Человекочитаемые подписи для UI (не для XML/API). */

export const CHECK_CODE_LABELS: Record<string, string> = {
  E01: 'Обязательные поля',
  E02: 'Значение вне диапазона ОА',
  E03: 'Нет сопоставления с ОА',
  E04: 'СИ не найдено или без кода ФГИС',
  E05: 'Поверка СИ не действует на дату измерений',
  E06: 'Исполнитель без кода ФИО во ФГИС',
  E07: 'Даты измерений позже даты протокола',
  E08: 'Окончание измерений раньше начала',
  E09: 'Дата заявки позже даты протокола',
  E10: 'Дубликат номера и даты протокола',
  E11: 'Дата протокола в будущем',
  E12: 'Позиция из расширяемой ОА без признака 353',
  E13: 'У заказчика нет ИНН и ОГРН',
  E14: 'Нет контакта заказчика',
  E15: 'Единица не найдена или нет пересчёта',
  W01: 'Условия измерений вне пределов',
  W02: 'Расхождение пересчёта с Excel',
  W03: 'Свидетельство или срок поверки не совпадают',
  W05: 'Несколько пар напряжения сети',
  W06: 'Не указан год выпуска объекта',
  W07: 'Диапазон ОА не распознан',
}

export function checkCodeLabel(code: string): string {
  const title = CHECK_CODE_LABELS[code]
  return title ? `${code} — ${title}` : code
}

export const OA_EDITION_KIND_LABELS: Record<string, string> = {
  current: 'действующая',
  extension: 'расширяемая',
}

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  protocols: 'Протоколы',
  protocol_issues: 'Замечания',
  protocol_results: 'Результаты',
  fgis_exports: 'Выгрузки во ФГИС',
  settings: 'Настройки',
  customers: 'Заказчики',
  form_indicator_map: 'Сопоставление показателей',
  staff: 'Персонал',
  equipment: 'Оборудование',
  units: 'Единицы',
  oa_editions: 'Редакции ОА',
  oa_items: 'Позиции ОА',
}

export const SETTING_KEY_LABELS: Record<string, string> = {
  lab_address_id: 'Код адреса ИЛ во ФГИС',
  lab_address_text: 'Адрес ИЛ (текст)',
  approver_staff_id: 'Руководитель для выгрузки',
  recalc_tolerance: 'Допуск пересчёта',
  severity_overrides: 'Уровни строгости проверок',
}

export function settingKeyLabel(key: string): string {
  return SETTING_KEY_LABELS[key] ?? key
}

export function oaEditionKindLabel(kind: string): string {
  return OA_EDITION_KIND_LABELS[kind] ?? kind
}

export function auditEntityLabel(entity: string): string {
  return AUDIT_ENTITY_LABELS[entity] ?? entity
}

export const EQUIPMENT_KIND_LABELS: Record<string, string> = {
  si: 'СИ',
  aux: 'вспомогательное',
  test: 'испытательное',
}

export function equipmentKindLabel(kind: string): string {
  return EQUIPMENT_KIND_LABELS[kind] ?? kind
}

/** Разборчик Excel-формы — только для UI. */
export const PARSER_PROFILE_LABELS: Record<string, string> = {
  'physio-bb': 'Физиотерапия (таблица BB)',
  'physio-df': 'Дефибриллятор',
  xray: 'Рентген',
  'xray-ct': 'КТ',
  rk: 'Радиационный контроль',
  sz: 'Средства защиты',
  idk: 'Индивидуальный дозиметрический контроль',
  vent: 'Вентиляция / воздух',
  micro: 'Микроклимат',
  light: 'Освещённость',
  emf: 'ЭМП',
  noise: 'Шум',
}

export function parserProfileLabel(profile: string): string {
  return PARSER_PROFILE_LABELS[profile] ?? 'Профиль в разработке'
}

export {
  formatAuditDiff,
  formatAuditDiffLines,
  formatDisplayValue,
  formatNum,
} from '@/shared/ui/audit-format'
