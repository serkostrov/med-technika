/**
 * Перечисления строго по ТЗ §4.
 * Используем const-объекты (erasable), значения enum не удаляем — только расширяем.
 */

export const AppRole = {
  head: 'head',
  engineer: 'engineer',
} as const
export type AppRole = (typeof AppRole)[keyof typeof AppRole]

export const ProtocolStatus = {
  review: 'review',
  approved: 'approved',
  ready: 'ready',
  exported: 'exported',
  sent: 'sent',
} as const
export type ProtocolStatus = (typeof ProtocolStatus)[keyof typeof ProtocolStatus]

export const PROTOCOL_STATUS_LABELS: Record<ProtocolStatus, string> = {
  review: 'На проверке',
  approved: 'Утверждён',
  ready: 'Готов к передаче',
  exported: 'Выгружен в XML',
  sent: 'Передан во ФГИС',
}

export const IssueSeverity = {
  error: 'error',
  warning: 'warning',
} as const
export type IssueSeverity = (typeof IssueSeverity)[keyof typeof IssueSeverity]

export const OaEditionKind = {
  current: 'current',
  extension: 'extension',
} as const
export type OaEditionKind = (typeof OaEditionKind)[keyof typeof OaEditionKind]

export const EquipmentKind = {
  si: 'si',
  aux: 'aux',
  test: 'test',
} as const
export type EquipmentKind = (typeof EquipmentKind)[keyof typeof EquipmentKind]

export const FormStatus = {
  ready: 'ready',
  in_progress: 'in_progress',
  no_materials: 'no_materials',
} as const
export type FormStatus = (typeof FormStatus)[keyof typeof FormStatus]

export const FORM_STATUS_LABELS: Record<FormStatus, string> = {
  ready: 'Готова',
  in_progress: 'В работе',
  no_materials: 'Нет материалов',
}

/** CustomerKindId во ФГИС: 1 ЮЛ, 2 ИП, 3 иностр., 4 ФЛ */
export const CustomerKindId = {
  legalEntity: 1,
  soleProprietor: 2,
  foreign: 3,
  individual: 4,
} as const
export type CustomerKindId = (typeof CustomerKindId)[keyof typeof CustomerKindId]
