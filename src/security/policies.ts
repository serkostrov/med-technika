import type { Protocol } from '@/domain'
import { ProtocolStatus } from '@/domain'
import {
  isHead,
  ownsProtocol,
  type AuthContext,
} from './context'
import { forbidden, unauthenticated } from './errors'
import { SecuredOperation, type SecuredOperation as Op } from './operations'

export type PolicyResource = {
  protocol?: Protocol
}

/**
 * Единая точка авторизации. UI-скрытие кнопок сюда не входит.
 */
export function authorize(
  ctx: AuthContext | null,
  operation: Op,
  resource: PolicyResource = {},
): void {
  if (!ctx) unauthenticated()

  switch (operation) {
    case SecuredOperation.protocolList:
    case SecuredOperation.protocolSave:
    case SecuredOperation.dictionaryRead:
    case SecuredOperation.customerCreateOnUpload:
      return

    case SecuredOperation.protocolGet:
    case SecuredOperation.protocolUpdate:
    case SecuredOperation.protocolAttachScan:
    case SecuredOperation.issueAcknowledge:
      requireProtocolAccess(ctx, resource.protocol, 'write-or-view')
      return

    case SecuredOperation.protocolDelete:
      requireProtocolAccess(ctx, resource.protocol, 'delete')
      return

    case SecuredOperation.protocolApprove:
    case SecuredOperation.protocolReturn:
    case SecuredOperation.fgisBuildXml:
    case SecuredOperation.fgisMarkUploaded:
    case SecuredOperation.dictionaryWrite:
    case SecuredOperation.userCreate:
    case SecuredOperation.userList:
    case SecuredOperation.settingsRead:
    case SecuredOperation.settingsWrite:
      if (!isHead(ctx)) forbidden('Операция доступна только начальнику ИЛ')
      return

    case SecuredOperation.auditRead:
      // head — всё; engineer — только по своим (фильтр на уровне handler)
      return

    case SecuredOperation.protocolDirectStatusUpdate:
      forbidden(
        'Прямое изменение статуса протокола запрещено. Используйте RPC жизненного цикла.',
      )
      return

    default: {
      const _exhaustive: never = operation
      forbidden(`Неизвестная операция: ${_exhaustive}`)
    }
  }
}

function requireProtocolAccess(
  ctx: AuthContext,
  protocol: Protocol | undefined,
  mode: 'write-or-view' | 'delete',
): void {
  if (!protocol) forbidden('Протокол не указан для проверки доступа')
  if (isHead(ctx)) return
  if (!ownsProtocol(ctx, protocol)) {
    forbidden('Нет доступа к чужому протоколу')
  }
  if (mode === 'delete' && protocol.status !== ProtocolStatus.review) {
    forbidden('Инженер может удалять только свои протоколы в статусе review')
  }
}

/** UX-хелпер: какие действия показывать в интерфейсе (не security). */
export function uiCapabilities(ctx: AuthContext) {
  const head = isHead(ctx)
  return {
    canApprove: head,
    canReturn: head,
    canBuildXml: head,
    canMarkUploaded: head,
    canManageDictionaries: head,
    canManageUsers: head,
    canManageSettings: head,
    canUpload: true,
    canViewAllProtocols: head,
    isHead: head,
  }
}

/**
 * Можно ли показать кнопку удаления.
 * После exported/sent — нельзя; инженер — только review; начальник — до выгрузки.
 */
export function canDeleteProtocolUi(
  status: Protocol['status'],
  isHeadUser: boolean,
): boolean {
  if (
    status === ProtocolStatus.exported ||
    status === ProtocolStatus.sent
  ) {
    return false
  }
  if (isHeadUser) return true
  return status === ProtocolStatus.review
}
