import type {
  AuditLogEntry,
  Customer,
  Equipment,
  EquipmentVerification,
  FgisExport,
  FgisExportItem,
  FormIndicatorMap,
  FsaEntry,
  MeasurementKind,
  OaEdition,
  OaItem,
  Protocol,
  ProtocolEquipment,
  ProtocolForm,
  ProtocolIssue,
  ProtocolObject,
  ProtocolResult,
  Setting,
  Staff,
  Unit,
  UnitConversion,
} from '@/domain'
import type { AuthAccount, SessionToken } from '@/server/auth/types'
import { createSeedBundle } from '@/data/seed'
import type { PendingUpload } from '@/server/upload/chunked-upload'

/** Мутабельное серверное хранилище (заменимо на Postgres/Supabase). */
export type Database = {
  authAccounts: AuthAccount[]
  sessions: SessionToken[]
  staff: Staff[]
  customers: Customer[]
  oaEditions: OaEdition[]
  oaItems: OaItem[]
  units: Unit[]
  unitConversions: UnitConversion[]
  equipment: Equipment[]
  equipmentVerifications: EquipmentVerification[]
  measurementKinds: MeasurementKind[]
  protocolForms: ProtocolForm[]
  formIndicatorMaps: FormIndicatorMap[]
  protocols: Protocol[]
  protocolObjects: ProtocolObject[]
  protocolResults: ProtocolResult[]
  protocolEquipment: ProtocolEquipment[]
  protocolIssues: ProtocolIssue[]
  fgisExports: FgisExport[]
  fgisExportItems: FgisExportItem[]
  fsaEntries: FsaEntry[]
  auditLog: AuditLogEntry[]
  settings: Setting[]
  auditSeq: number
  /** Неизменяемые исходники протоколов (Storage bucket protocol-sources). */
  protocolSources: Map<
    string,
    { path: string; sha256: string; fileName: string; bytes: ArrayBuffer; uploadedAt: string }
  >
  /** Защищённое хранилище сканов PDF (Storage bucket protocol-scans). */
  protocolScans: Map<
    string,
    { path: string; fileName: string; bytes: ArrayBuffer; uploadedAt: string; uploadedBy: string }
  >
  /** Содержимое выгрузок XML (Storage bucket fgis-exports). */
  fgisExportFiles: Map<
    string,
    {
      path: string
      fileName: string
      xml: string
      previewXml: string
      createdAt: string
      createdBy: string
    }
  >
  /** Временные чанковые загрузки (до разбора / прикрепления скана). */
  pendingUploads: Map<string, PendingUpload>
}

export function createEmptyDatabase(): Database {
  const seed = createSeedBundle()
  return {
    authAccounts: [],
    sessions: [],
    staff: seed.staff.map((s) => ({ ...s })),
    customers: [],
    oaEditions: seed.oaEditions.map((e) => ({ ...e })),
    oaItems: seed.oaItems.map((i) => ({ ...i })),
    units: seed.units.map((u) => ({ ...u })),
    unitConversions: seed.unitConversions.map((c) => ({ ...c })),
    equipment: [],
    equipmentVerifications: [],
    measurementKinds: seed.measurementKinds.map((k) => ({ ...k })),
    protocolForms: seed.protocolForms.map((f) => ({ ...f })),
    formIndicatorMaps: seed.formIndicatorMaps.map((m) => ({ ...m })),
    protocols: [],
    protocolObjects: [],
    protocolResults: [],
    protocolEquipment: [],
    protocolIssues: [],
    fgisExports: [],
    fgisExportItems: [],
    fsaEntries: [],
    auditLog: [],
    settings: seed.settings.map((s) => ({ ...s })),
    auditSeq: 1,
    protocolSources: new Map(),
    protocolScans: new Map(),
    fgisExportFiles: new Map(),
    pendingUploads: new Map(),
  }
}
