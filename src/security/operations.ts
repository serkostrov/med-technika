/**
 * Серверные операции, защищённые политиками (ТЗ §5, §14).
 */
export const SecuredOperation = {
  protocolList: 'protocol.list',
  protocolGet: 'protocol.get',
  protocolSave: 'protocol.save',
  protocolUpdate: 'protocol.update',
  protocolApprove: 'protocol.approve',
  protocolReturn: 'protocol.return',
  protocolAttachScan: 'protocol.attach_scan',
  protocolDelete: 'protocol.delete',
  /** Всегда запрещено — статус только через lifecycle RPC */
  protocolDirectStatusUpdate: 'protocol.direct_status_update',

  issueAcknowledge: 'issue.acknowledge',

  fgisBuildXml: 'fgis.build_xml',
  fgisMarkUploaded: 'fgis.mark_uploaded',

  dictionaryRead: 'dictionary.read',
  dictionaryWrite: 'dictionary.write',
  customerCreateOnUpload: 'customer.create_on_upload',

  userCreate: 'user.create',
  userList: 'user.list',
  settingsRead: 'settings.read',
  settingsWrite: 'settings.write',

  auditRead: 'audit.read',
} as const

export type SecuredOperation =
  (typeof SecuredOperation)[keyof typeof SecuredOperation]
