import type { EquipmentKind } from '@/domain'

export type ParsedObject = {
  seq: number
  name: string | null
  serialNo: string | null
  year: string | null
  department: string | null
}

export type ParsedResult = {
  seq: number
  objectSeq: number | null
  sourceKey: string
  indicatorRaw: string | null
  unitSymbol: string | null
  setValue: string | null
  rawValues: number[] | null
  avgExcel: number | null
  uExcel: number | null
  avgCalc: number | null
  uCalc: number | null
  numberFormat: string | null
  /** FactValue — отображаемое значение как text (ТЗ §6.6) */
  factValue: string
  displayValue: number | null
}

export type ParsedEquipment = {
  seq: number
  kind: EquipmentKind
  rawText: string
  name: string | null
  serialRaw: string | null
  certRaw: string | null
  validUntilRaw: string | null
}

export type ParsedNdRow = {
  designation: string
  name: string
  indicator: string
}

export type ParsedMetadata = {
  number: string
  protocolDate: string
  objectFullName: string | null
  customerName: string | null
  customerLegalAddress: string | null
  customerActualAddress: string | null
  customerPhone: string | null
  measurePlace: string | null
  measureAddress: string | null
  measureStart: string | null
  measureEnd: string | null
  engineerShortName: string | null
  conditions: {
    t?: number
    rh?: number
    p?: number
    voltages?: { start?: number; end?: number }[]
  }
  ndRows: ParsedNdRow[]
}

/** Унифицированный внутренний формат разбора (ТЗ §6.4). */
export type ParsedProtocol = {
  parserVersion: string
  profileVersion: string
  formId: string
  formTitle: string
  parserProfile: string
  sheetName: string
  metadata: ParsedMetadata
  objects: ParsedObject[]
  results: ParsedResult[]
  equipment: ParsedEquipment[]
  log: string[]
}

export type FormCandidate = {
  formId: string
  sheetName: string
  title: string
  parserProfile: string
  status: string
  number: string
  protocolDate: string
  numberSuffix: string | null
}

export type FormDetectionResult =
  | { ok: true; candidate: FormCandidate; alternatives: FormCandidate[] }
  | { ok: false; reason: string; alternatives: FormCandidate[] }

export class ParseError extends Error {
  code: string

  constructor(message: string, code = 'PARSE_FAILED') {
    super(message)
    this.name = 'ParseError'
    this.code = code
  }
}

export type ParseProgressEvent = {
  stage: string
  message: string
}
