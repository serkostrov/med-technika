import type {
  AppRole,
  CustomerKindId,
  EquipmentKind,
  FormStatus,
  IssueSeverity,
  OaEditionKind,
  ProtocolStatus,
} from './enums'
import type {
  CalendarDate,
  DisplayText,
  EntityId,
  InstantUtc,
  MeasureNumber,
  SoftDeletable,
} from './primitives'

export type Staff = SoftDeletable & {
  id: EntityId
  /** Связь с учётной записью; null — персонал ФГИС без логина (ТЗ §4) */
  authUserId: EntityId | null
  fullName: string
  shortName: string
  surname: string
  fgisIdFullName: number | null
  postName: string | null
  fgisRoleIds: number[]
  appRole: AppRole
  isActive: boolean
}

export type Customer = SoftDeletable & {
  id: EntityId
  name: string
  nameAliases: string[]
  kindId: CustomerKindId
  inn: string | null
  ogrn: string | null
  phone: string | null
  email: string | null
  legalAddress: string | null
  actualAddress: string | null
  createdAt: InstantUtc
}

export type OaEdition = {
  id: EntityId
  title: string
  kind: OaEditionKind
  isActive: boolean
  sourceFile: string | null
  loadedAt: InstantUtc
}

/**
 * Позиции ОА. При повторном импорте старая редакция деактивируется,
 * ссылки протоколов на старые oa_item_id сохраняются (ТЗ §12).
 */
export type OaItem = SoftDeletable & {
  id: EntityId
  editionId: EntityId
  itemNo: string
  methodikText: string
  methodikFgisId: number | null
  methodText: string | null
  methodFgisId: number | null
  objectType: string | null
  indicatorText: string
  indicatorFgisId: string | null
  unitText: string | null
  unitFgisId: string | null
  rangeText: string | null
  rangeMin: MeasureNumber | null
  rangeMax: MeasureNumber | null
  isCalculated: boolean
  objectName: string | null
}

export type Unit = {
  fgisId: string
  name: string | null
  symbol: string
}

export type UnitConversion = {
  fromSymbol: string
  toSymbol: string
  factor: MeasureNumber
}

export type Equipment = SoftDeletable & {
  id: EntityId
  name: string
  serialNo: string | null
  serialNorm: string | null
  invNo: string | null
  fgisEquipmentId: number | null
  kind: EquipmentKind
  isActive: boolean
}

export type EquipmentVerification = SoftDeletable & {
  id: EntityId
  equipmentId: EntityId
  certNo: string
  verifiedOn: CalendarDate | null
  validUntil: CalendarDate
  createdAt: InstantUtc
}

export type MeasurementKind = {
  id: number
  code: string
  title: string
  suffix: string | null
}

export type ProtocolForm = {
  id: EntityId
  kindId: number | null
  templateFile: string
  sheetName: string
  title: string
  parserProfile: string
  status: FormStatus
  typeObjectId: number | null
  fgisDirectory: string
  /** {"t":[15,35],"rh":[0,80],"p":[84,106]} — строгие границы */
  conditionsLimits: Record<string, [number, number]> | null
  settings: Record<string, unknown>
}

export type FormIndicatorMap = {
  id: EntityId
  formId: EntityId
  sourceKey: string
  oaItemId: EntityId
  /** Параметры инструментальной составляющей uB (ТЗ §6.5) */
  ub: { type: 'rel' | 'abs'; value: number } | null
}

/**
 * Статус протокола намеренно недоступен для прямого присваивания из UI.
 * Изменение только через ProtocolLifecycle / команды приложения.
 */
export type Protocol = SoftDeletable & {
  id: EntityId
  number: string
  protocolDate: CalendarDate
  measureStart: CalendarDate | null
  measureEnd: CalendarDate | null
  modelGetDate: CalendarDate | null
  applicationDate: CalendarDate | null
  formId: EntityId
  customerId: EntityId | null
  /** Полный JSON парсера — источник разобранных данных */
  raw: Record<string, unknown>
  objectFullName: string | null
  measurePlace: string | null
  measureAddress: string | null
  territoryFeature: boolean | null
  customerPhone: string | null
  conditions: Record<string, unknown> | null
  engineerStaffId: EntityId | null
  accredScope353: boolean
  readonly status: ProtocolStatus
  sourcePath: string
  sourceSha256: string
  parserVersion: string | null
  scanPath: string | null
  uploadedBy: EntityId | null
  uploadedAt: InstantUtc
  approvedBy: EntityId | null
  approvedAt: InstantUtc | null
}

export type ProtocolObject = {
  id: EntityId
  protocolId: EntityId
  seq: number | null
  name: string | null
  serialNo: string | null
  year: string | null
  department: string | null
}

export type ProtocolResult = {
  id: EntityId
  protocolId: EntityId
  objectId: EntityId | null
  seq: number
  sourceKey: string
  indicatorRaw: string | null
  unitSymbol: string | null
  setValue: string | null
  rawValues: MeasureNumber[] | null
  avgExcel: MeasureNumber | null
  uExcel: MeasureNumber | null
  avgCalc: MeasureNumber | null
  uCalc: MeasureNumber | null
  numberFormat: string | null
  /**
   * Отображаемое число из Excel (AK/Y) до FactValue.
   * Не смешивать с avgCalc / factValue (ТЗ §6.6).
   */
  displayExcel: MeasureNumber | null
  factValue: DisplayText
  oaItemId: EntityId | null
  includeInXml: boolean
}

export type ProtocolEquipment = {
  protocolId: EntityId
  seq: number
  equipmentId: EntityId | null
  rawText: string | null
  serialRaw: string | null
  certRaw: string | null
  validUntilRaw: CalendarDate | null
  kind: EquipmentKind | null
}

export type ProtocolIssue = {
  id: EntityId
  protocolId: EntityId
  code: string
  severity: IssueSeverity
  message: string
  ref: Record<string, unknown> | null
  acknowledgedBy: EntityId | null
  acknowledgedAt: InstantUtc | null
  ackComment: string | null
  isActive: boolean
  createdAt: InstantUtc
}

export type FgisExport = {
  id: EntityId
  filePath: string
  fileSize: number | null
  protocolsCount: number | null
  createdBy: EntityId | null
  createdAt: InstantUtc
  uploadedMarkedBy: EntityId | null
  uploadedMarkedAt: InstantUtc | null
}

export type FgisExportItem = {
  exportId: EntityId
  protocolId: EntityId
}

export type AuditLogEntry = {
  id: number
  entity: string
  entityId: EntityId | null
  action: string
  actor: EntityId | null
  at: InstantUtc
  diff: Record<string, unknown> | null
}

export type Setting = {
  key: string
  value: unknown
}

/** Опциональные справочники ФСА (ТЗ §12). */
export type FsaEntry = {
  id: string
  name: string
  isActual: boolean
  catalog: 'indicators' | 'docs' | 'methods' | 'vvf' | 'harmful'
}


/** Поля, которые UI может править (ТЗ §6.8). status сюда не входит. */
export type ProtocolEditablePatch = {
  applicationDate?: CalendarDate | null
  accredScope353?: boolean
  measureStart?: CalendarDate | null
  measureEnd?: CalendarDate | null
  customerId?: EntityId | null
  engineerStaffId?: EntityId | null
  objectFullName?: string | null
  measurePlace?: string | null
  measureAddress?: string | null
  territoryFeature?: boolean | null
  customerPhone?: string | null
}
