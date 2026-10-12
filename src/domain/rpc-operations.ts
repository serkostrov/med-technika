/**
 * Каталог RPC / Edge-операций из ТЗ §14.
 * Доменная модель должна покрывать входные/выходные сущности каждой операции.
 * Реализация самих операций — на следующих этапах.
 */

export const RpcOperation = {
  parseProtocol: 'parse-protocol',
  protocolSave: 'protocol_save',
  protocolReplace: 'protocol_replace',
  protocolRunChecks: 'protocol_run_checks',
  protocolUpdate: 'protocol_update',
  resultSetOa: 'result_set_oa',
  resultSetInclude: 'result_set_include',
  issueAcknowledge: 'issue_acknowledge',
  protocolApprove: 'protocol_approve',
  protocolReturn: 'protocol_return',
  protocolAttachScan: 'protocol_attach_scan',
  protocolDelete: 'protocol_delete',
  buildFgisXml: 'build-fgis-xml',
  exportMarkUploaded: 'export_mark_uploaded',
  customerUpsert: 'customer_upsert',
  customerAddAlias: 'customer_add_alias',
  oaImport: 'oa_import',
  equipmentImport: 'equipment_import',
  staffImport: 'staff_import',
  unitsImport: 'units_import',
} as const

export type RpcOperation = (typeof RpcOperation)[keyof typeof RpcOperation]

export type RpcCoverage = {
  operation: RpcOperation
  /** Сущности / поля модели, задействованные операцией */
  touches: string[]
  /** Меняет ли статус протокола (только через lifecycle) */
  changesProtocolStatus: boolean
}

export const RPC_COVERAGE: readonly RpcCoverage[] = [
  {
    operation: RpcOperation.parseProtocol,
    touches: ['ProtocolForm', 'raw parse JSON'],
    changesProtocolStatus: false,
  },
  {
    operation: RpcOperation.protocolSave,
    touches: [
      'Protocol',
      'ProtocolObject',
      'ProtocolResult',
      'ProtocolEquipment',
      'ProtocolIssue',
      'Customer',
    ],
    changesProtocolStatus: true, // → review
  },
  {
    operation: RpcOperation.protocolReplace,
    touches: ['Protocol (soft-delete old)', 'Protocol* children', 'AuditLog'],
    changesProtocolStatus: true,
  },
  {
    operation: RpcOperation.protocolRunChecks,
    touches: ['ProtocolIssue', 'Protocol', 'OaItem', 'EquipmentVerification', 'Unit'],
    changesProtocolStatus: false,
  },
  {
    operation: RpcOperation.protocolUpdate,
    touches: ['ProtocolEditablePatch fields only — never status'],
    changesProtocolStatus: true, // approved/ready → review
  },
  {
    operation: RpcOperation.resultSetOa,
    touches: ['ProtocolResult.oaItemId', 'FormIndicatorMap'],
    changesProtocolStatus: true,
  },
  {
    operation: RpcOperation.resultSetInclude,
    touches: ['ProtocolResult.includeInXml', 'AuditLog'],
    changesProtocolStatus: true,
  },
  {
    operation: RpcOperation.issueAcknowledge,
    touches: ['ProtocolIssue.acknowledged*'],
    changesProtocolStatus: false,
  },
  {
    operation: RpcOperation.protocolApprove,
    touches: ['Protocol.status', 'Protocol.approvedBy/At'],
    changesProtocolStatus: true,
  },
  {
    operation: RpcOperation.protocolReturn,
    touches: ['Protocol.status', 'AuditLog'],
    changesProtocolStatus: true,
  },
  {
    operation: RpcOperation.protocolAttachScan,
    touches: ['Protocol.scanPath', 'Protocol.status → ready'],
    changesProtocolStatus: true,
  },
  {
    operation: RpcOperation.protocolDelete,
    touches: ['Protocol.deletedAt'],
    changesProtocolStatus: false,
  },
  {
    operation: RpcOperation.buildFgisXml,
    touches: ['FgisExport', 'FgisExportItem', 'Protocol.status → exported'],
    changesProtocolStatus: true,
  },
  {
    operation: RpcOperation.exportMarkUploaded,
    touches: ['FgisExport.uploadedMarked*', 'Protocol.status → sent'],
    changesProtocolStatus: true,
  },
  {
    operation: RpcOperation.customerUpsert,
    touches: ['Customer'],
    changesProtocolStatus: false,
  },
  {
    operation: RpcOperation.customerAddAlias,
    touches: ['Customer.nameAliases'],
    changesProtocolStatus: false,
  },
  {
    operation: RpcOperation.oaImport,
    touches: ['OaEdition', 'OaItem'],
    changesProtocolStatus: false,
  },
  {
    operation: RpcOperation.equipmentImport,
    touches: ['Equipment'],
    changesProtocolStatus: false,
  },
  {
    operation: RpcOperation.staffImport,
    touches: ['Staff'],
    changesProtocolStatus: false,
  },
  {
    operation: RpcOperation.unitsImport,
    touches: ['Unit'],
    changesProtocolStatus: false,
  },
]

export function listUncoveredOperations(
  implemented: ReadonlySet<RpcOperation>,
): RpcOperation[] {
  return RPC_COVERAGE.map((c) => c.operation).filter((op) => !implemented.has(op))
}
