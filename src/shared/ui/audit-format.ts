import { checkCodeLabel, SETTING_KEY_LABELS } from '@/shared/ui/labels'
import { formatUiTemporal } from '@/shared/time/moscow'

/** Число для UI без мусора float64. */
export function formatNum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const rounded = Math.round(v * 1e6) / 1e6
  return String(rounded)
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`
}

const AUDIT_FIELD_LABELS: Record<string, string> = {
  comment: 'Комментарий',
  reason: 'Причина',
  includeInXml: 'В выгрузке',
  oaItemId: 'Позиция ОА',
  equipmentId: 'Оборудование',
  fileName: 'Файл',
  number: 'Номер',
  protocolDate: 'Дата протокола',
  applicationDate: 'Дата заявки',
  measureStart: 'Начало измерений',
  measureEnd: 'Окончание измерений',
  objectFullName: 'Объект',
  objectName: 'Объект',
  customerId: 'Заказчик',
  customerName: 'Заказчик',
  engineerStaffId: 'Исполнитель',
  measurePlace: 'Место измерений',
  measureAddress: 'Адрес измерений',
  engineerName: 'Исполнитель',
  fullName: 'ФИО',
  shortName: 'Кратко',
  surname: 'Фамилия',
  postName: 'Должность',
  appRole: 'Роль',
  isActive: 'Активен',
  name: 'Название',
  kind: 'Тип',
  serialNo: 'Зав. №',
  invNo: 'Инв. №',
  certNo: 'Свидетельство',
  validUntil: 'Действует до',
  verifiedOn: 'Дата поверки',
  status: 'Статус',
  alias: 'Псевдоним',
  before: 'Было',
  after: 'Стало',
  key: 'Параметр',
  value: 'Значение',
  row: 'Строка',
  sourceFile: 'Файл',
  protocolIds: 'Протоколы',
  skipped: 'Пропущено',
  exportId: 'Выгрузка',
  fgisIdFullName: 'Код ФИО во ФГИС',
  fgisEquipmentId: 'Код СИ во ФГИС',
  itemNo: 'Пункт',
  indicatorText: 'Показатель',
  indicator: 'Показатель',
  unitSymbol: 'Ед.',
  code: 'Проверка',
  message: 'Суть',
  where: 'Где',
  location: 'Где',
  oaItemNo: 'Пункт ОА',
  oaIndicator: 'Показатель ОА',
  equipmentName: 'СИ',
  rawText: 'Текст из Excel',
  seq: 'Строка СИ',
  sizeBytes: 'Размер',
  summary: 'Сводка',
}

const HIDDEN_AUDIT_KEYS = new Set([
  'id',
  'sha256',
  'sourceSha256',
  'passwordHash',
  'authUserId',
  'createdBy',
  'createdAt',
  'deletedAt',
  'uploadedAt',
  'sourcePath',
  'scanPath',
  'fgisRoleIds',
  'bytes',
  'uploadId',
  'token',
  'password',
  'salt',
  'resultId',
  'issueId',
  'protocolId',
])

const PRIORITY_KEYS = [
  'summary',
  'code',
  'message',
  'where',
  'location',
  'objectName',
  'objectFullName',
  'indicator',
  'indicatorText',
  'oaItemNo',
  'oaIndicator',
  'equipmentName',
  'rawText',
  'fileName',
  'number',
  'includeInXml',
  'comment',
  'reason',
  'sizeBytes',
  'seq',
]

function isOpaqueId(value: string): boolean {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return true
  }
  if (/^[0-9a-f]{32,64}$/i.test(value)) return true
  if (/^[0-9a-f]{40,}$/i.test(value)) return true
  return false
}

function fieldLabel(key: string): string {
  return AUDIT_FIELD_LABELS[key] ?? SETTING_KEY_LABELS[key] ?? key
}

function formatScalar(key: string, value: unknown): string | null {
  if (value == null) return '—'
  if (key === 'sizeBytes' && typeof value === 'number') {
    return formatBytes(value)
  }
  if (key === 'code' && typeof value === 'string') {
    return checkCodeLabel(value)
  }
  if (key === 'includeInXml' && typeof value === 'boolean') {
    return value ? 'включено' : 'исключено'
  }
  if (key === 'seq' && typeof value === 'number') {
    return `№ ${value}`
  }
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  if (typeof value === 'number') return formatNum(value)
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t) return '—'
    if (isOpaqueId(t)) return null
    if (t.startsWith('{') || t.startsWith('[')) return null
    if (t.includes('/') && (t.endsWith('.xlsx') || t.endsWith('.pdf'))) {
      const name = t.split('/').pop()
      return name || null
    }
    return formatUiTemporal(t)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return 'пусто'
    const parts = value
      .map((v) => formatScalar(key, v))
      .filter((v): v is string => Boolean(v && v !== '—'))
    if (parts.length === 0) return `${value.length} шт.`
    if (parts.length <= 3) return parts.join(', ')
    return `${parts.slice(0, 3).join(', ')}… (${parts.length})`
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const name =
      (typeof obj.fullName === 'string' && obj.fullName) ||
      (typeof obj.name === 'string' && obj.name) ||
      (typeof obj.number === 'string' && obj.number) ||
      (typeof obj.fileName === 'string' && obj.fileName) ||
      (typeof obj.label === 'string' && obj.label)
    if (name && !isOpaqueId(name)) return name
    return null
  }
  return null
}

/**
 * Строки деталей журнала (для многострочного отображения).
 */
export function formatAuditDiffLines(
  diff: Record<string, unknown> | null | undefined,
): string[] {
  if (!diff || Object.keys(diff).length === 0) return []

  if ('key' in diff && ('before' in diff || 'after' in diff)) {
    const key = String(diff.key ?? '')
    const label = SETTING_KEY_LABELS[key] ?? fieldLabel(key)
    const before = formatScalar('before', diff.before)
    const after = formatScalar('after', diff.after)
    if (before != null && after != null && before !== after) {
      return [`${label}: ${before} → ${after}`]
    }
    if (after != null) return [`${label}: ${after}`]
    return [label]
  }

  // Готовая сводка — показываем её первой, остальное без дублей
  const lines: string[] = []
  const used = new Set<string>()

  if (typeof diff.summary === 'string' && diff.summary.trim()) {
    lines.push(diff.summary.trim())
    used.add('summary')
  }

  const ordered = [
    ...PRIORITY_KEYS.filter((k) => k in diff && !used.has(k)),
    ...Object.keys(diff).filter((k) => !PRIORITY_KEYS.includes(k) && !used.has(k)),
  ]

  for (const key of ordered) {
    if (HIDDEN_AUDIT_KEYS.has(key)) continue
    if (key.endsWith('Id') && typeof diff[key] === 'string' && isOpaqueId(String(diff[key]))) {
      continue
    }
    // если code/message уже в summary — не дублируем
    if (
      lines.length > 0 &&
      (key === 'code' || key === 'message') &&
      typeof diff.summary === 'string'
    ) {
      continue
    }
    const formatted = formatScalar(key, diff[key])
    if (formatted == null || formatted === '—') continue
    if (key === 'summary') {
      lines.push(formatted)
    } else if (key === 'where' || key === 'location') {
      lines.push(`Где: ${formatted}`)
    } else if (key === 'message' && !lines.some((l) => l.includes(formatted))) {
      lines.push(formatted)
    } else if (key === 'code') {
      lines.push(formatted)
    } else {
      lines.push(`${fieldLabel(key)}: ${formatted}`)
    }
  }

  return lines
}

export function formatAuditDiff(
  diff: Record<string, unknown> | null | undefined,
): string {
  const lines = formatAuditDiffLines(diff)
  return lines.length > 0 ? lines.join(' · ') : '—'
}

/** Значение настройки / произвольное поле для UI. */
export function formatDisplayValue(value: unknown): string {
  if (value == null) return '—'
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return formatScalar('value', value) ?? '—'
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    const parts: string[] = []
    for (const [k, v] of Object.entries(obj)) {
      if (HIDDEN_AUDIT_KEYS.has(k)) continue
      const label =
        /^[EW]\d{2}$/.test(k) ? checkCodeLabel(k) : fieldLabel(k)
      let formatted: string | null
      if (v === 'error') formatted = 'ошибка'
      else if (v === 'warning') formatted = 'замечание'
      else formatted = formatScalar(k, v)
      if (formatted == null || formatted === '—') continue
      parts.push(`${label}: ${formatted}`)
    }
    return parts.length > 0 ? parts.join(' · ') : '—'
  }
  if (Array.isArray(value)) {
    return formatScalar('value', value) ?? '—'
  }
  return '—'
}
