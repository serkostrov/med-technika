import type {
  AuditLogEntry,
  Customer,
  Equipment,
  EquipmentVerification,
  OaItem,
  Protocol,
  ProtocolEditablePatch,
  ProtocolEquipment,
  ProtocolForm,
  ProtocolIssue,
  ProtocolObject,
  ProtocolResult,
  Staff,
} from '@/domain'

export type ProtocolResultView = ProtocolResult & {
  objectName: string | null
  oaItemNo: string | null
  oaIndicatorText: string | null
  oaRangeText: string | null
  oaRangeMin: number | null
  oaRangeMax: number | null
  oaUnitText: string | null
}

export type ProtocolEquipmentView = ProtocolEquipment & {
  equipmentName: string | null
  fgisEquipmentId: number | null
  serialNo: string | null
  verifications: EquipmentVerification[]
}

export type ProtocolIssueView = ProtocolIssue & {
  acknowledgedByName: string | null
}

export type AuditEntryView = AuditLogEntry & {
  actorName: string | null
  label: string
}

export type ProtocolCardDetail = {
  protocol: Protocol
  form: ProtocolForm | null
  /** form.settings.manualMeasureDates === true → 26-ИДК */
  canEditMeasureDates: boolean
  customer: Customer | null
  engineer: Staff | null
  objects: ProtocolObject[]
  results: ProtocolResultView[]
  equipment: ProtocolEquipmentView[]
  issues: ProtocolIssueView[]
  audit: AuditEntryView[]
  lookups: {
    customers: Pick<Customer, 'id' | 'name' | 'inn'>[]
    staff: Pick<Staff, 'id' | 'fullName' | 'shortName' | 'fgisIdFullName'>[]
    oaItems: Pick<
      OaItem,
      'id' | 'itemNo' | 'indicatorText' | 'rangeText' | 'unitText' | 'editionId'
    >[]
    equipment: Pick<
      Equipment,
      'id' | 'name' | 'serialNo' | 'fgisEquipmentId' | 'kind'
    >[]
  }
  xmlPreview: string
  approval: {
    canApprove: boolean
    blockReason: string | null
    errorCount: number
    warningCount: number
    unackedWarningCount: number
  }
  scan: {
    path: string | null
    fileName: string | null
    sizeBytes: number | null
  }
}

/** Поля карточки, разрешённые ТЗ §6.8 для protocol_update. */
export type CardEditablePatch = Pick<
  ProtocolEditablePatch,
  | 'applicationDate'
  | 'accredScope353'
  | 'measureStart'
  | 'measureEnd'
  | 'customerId'
  | 'engineerStaffId'
  | 'measurePlace'
  | 'measureAddress'
>
