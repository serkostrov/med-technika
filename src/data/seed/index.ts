import type {
  AuditLogEntry,
  Customer,
  Equipment,
  EquipmentVerification,
  FgisExport,
  FgisExportItem,
  Protocol,
  ProtocolEquipment,
  ProtocolIssue,
  ProtocolObject,
  ProtocolResult,
} from '@/domain'
import { SEED_MEASUREMENT_KINDS } from './measurement-kinds'
import { SEED_PROTOCOL_FORMS } from './protocol-forms'
import { SEED_UNITS, SEED_UNIT_CONVERSIONS } from './units'
import {
  SEED_FORM_INDICATOR_MAPS,
  SEED_OA_EDITIONS,
  SEED_OA_ITEMS,
} from './oa'
import { SEED_STAFF } from './staff'
import { SEED_SETTINGS } from './settings'

export type SeedBundle = {
  staff: typeof SEED_STAFF
  customers: readonly Customer[]
  oaEditions: typeof SEED_OA_EDITIONS
  oaItems: typeof SEED_OA_ITEMS
  units: typeof SEED_UNITS
  unitConversions: typeof SEED_UNIT_CONVERSIONS
  equipment: readonly Equipment[]
  equipmentVerifications: readonly EquipmentVerification[]
  measurementKinds: typeof SEED_MEASUREMENT_KINDS
  protocolForms: typeof SEED_PROTOCOL_FORMS
  formIndicatorMaps: typeof SEED_FORM_INDICATOR_MAPS
  protocols: readonly Protocol[]
  protocolObjects: readonly ProtocolObject[]
  protocolResults: readonly ProtocolResult[]
  protocolEquipment: readonly ProtocolEquipment[]
  protocolIssues: readonly ProtocolIssue[]
  fgisExports: readonly FgisExport[]
  fgisExportItems: readonly FgisExportItem[]
  auditLog: readonly AuditLogEntry[]
  settings: typeof SEED_SETTINGS
}

/** Начальные справочники без выдуманных протоколов и оборудования клиента. */
export function createSeedBundle(): SeedBundle {
  return {
    staff: SEED_STAFF,
    customers: [],
    oaEditions: SEED_OA_EDITIONS,
    oaItems: SEED_OA_ITEMS,
    units: SEED_UNITS,
    unitConversions: SEED_UNIT_CONVERSIONS,
    equipment: [],
    equipmentVerifications: [],
    measurementKinds: SEED_MEASUREMENT_KINDS,
    protocolForms: SEED_PROTOCOL_FORMS,
    formIndicatorMaps: SEED_FORM_INDICATOR_MAPS,
    protocols: [],
    protocolObjects: [],
    protocolResults: [],
    protocolEquipment: [],
    protocolIssues: [],
    fgisExports: [],
    fgisExportItems: [],
    auditLog: [],
    settings: SEED_SETTINGS,
  }
}

export {
  SEED_MEASUREMENT_KINDS,
  SEED_PROTOCOL_FORMS,
  SEED_UNITS,
  SEED_UNIT_CONVERSIONS,
  SEED_OA_EDITIONS,
  SEED_OA_ITEMS,
  SEED_FORM_INDICATOR_MAPS,
  SEED_STAFF,
  SEED_SETTINGS,
}
