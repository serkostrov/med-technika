import { ProtocolStatus } from './enums'
import type { ProtocolStatus as ProtocolStatusType } from './enums'
import type { CalendarDate, EntityId, InstantUtc } from './primitives'
import type { Protocol, ProtocolIssue } from './entities'

export class DomainError extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export type LifecycleActor = {
  staffId: EntityId
  isHead: boolean
}

function nowUtc(): InstantUtc {
  return new Date().toISOString()
}

function withStatus(protocol: Protocol, status: ProtocolStatusType): Protocol {
  return { ...protocol, status }
}

/** Можно ли утвердить: нет активных ошибок, все активные замечания приняты. */
export function canApprove(
  protocol: Protocol,
  issues: readonly ProtocolIssue[],
): { ok: true } | { ok: false; reason: string } {
  if (protocol.status !== ProtocolStatus.review) {
    return { ok: false, reason: 'Утверждение возможно только из статуса «На проверке»' }
  }
  const active = issues.filter((i) => i.isActive && i.protocolId === protocol.id)
  if (active.some((i) => i.severity === 'error')) {
    return { ok: false, reason: 'Есть активные ошибки' }
  }
  const unacked = active.filter(
    (i) => i.severity === 'warning' && i.acknowledgedAt === null,
  )
  if (unacked.length > 0) {
    return { ok: false, reason: 'Не все замечания приняты к сведению' }
  }
  return { ok: true }
}

/**
 * Готовность к ready: approved + скан PDF + дата заявки (ТЗ §9.1, §10.1).
 */
export function canBecomeReady(protocol: Protocol): boolean {
  return (
    protocol.status === ProtocolStatus.approved &&
    protocol.scanPath !== null &&
    protocol.applicationDate !== null
  )
}

export function approveProtocol(
  protocol: Protocol,
  issues: readonly ProtocolIssue[],
  actor: LifecycleActor,
  at: InstantUtc = nowUtc(),
): Protocol {
  if (!actor.isHead) {
    throw new DomainError('Утверждать может только начальник ИЛ', 'FORBIDDEN')
  }
  const check = canApprove(protocol, issues)
  if (!check.ok) {
    throw new DomainError(check.reason, 'APPROVE_BLOCKED')
  }
  let next = withStatus(protocol, ProtocolStatus.approved)
  next = {
    ...next,
    approvedBy: actor.staffId,
    approvedAt: at,
  }
  if (canBecomeReady(next)) {
    next = withStatus(next, ProtocolStatus.ready)
  }
  return next
}

export function returnToReview(
  protocol: Protocol,
  actor: LifecycleActor,
  reason: string,
): Protocol {
  if (!actor.isHead) {
    throw new DomainError('Возврат на проверку — только начальник ИЛ', 'FORBIDDEN')
  }
  if (!reason.trim()) {
    throw new DomainError('Укажите причину возврата', 'REASON_REQUIRED')
  }
  if (
    protocol.status !== ProtocolStatus.approved &&
    protocol.status !== ProtocolStatus.ready
  ) {
    throw new DomainError(
      'Вернуть на проверку можно из статусов «Утверждён» или «Готов к передаче»',
      'INVALID_STATUS',
    )
  }
  return {
    ...withStatus(protocol, ProtocolStatus.review),
    approvedBy: null,
    approvedAt: null,
  }
}

/**
 * Любая правка карточки в approved/ready → review и снятие утверждения (ТЗ §6.8).
 */
export function afterEditablePatch(protocol: Protocol): Protocol {
  if (
    protocol.status === ProtocolStatus.approved ||
    protocol.status === ProtocolStatus.ready
  ) {
    return {
      ...withStatus(protocol, ProtocolStatus.review),
      approvedBy: null,
      approvedAt: null,
    }
  }
  return protocol
}

export function attachScan(
  protocol: Protocol,
  scanPath: string,
  applicationDate?: CalendarDate | null,
): Protocol {
  let next: Protocol = {
    ...protocol,
    scanPath,
    applicationDate:
      applicationDate !== undefined ? applicationDate : protocol.applicationDate,
  }
  if (next.status === ProtocolStatus.approved && canBecomeReady(next)) {
    next = withStatus(next, ProtocolStatus.ready)
  }
  return next
}

/** Снять скан. После выгрузки запрещено; из ready → approved. */
export function detachScan(protocol: Protocol): Protocol {
  if (
    protocol.status === ProtocolStatus.exported ||
    protocol.status === ProtocolStatus.sent
  ) {
    throw new DomainError(
      'Нельзя удалить скан после выгрузки',
      'SCAN_DETACH_FORBIDDEN',
    )
  }
  if (!protocol.scanPath) {
    throw new DomainError('Скан не прикреплён', 'SCAN_MISSING')
  }
  let next: Protocol = { ...protocol, scanPath: null }
  if (next.status === ProtocolStatus.ready) {
    next = withStatus(next, ProtocolStatus.approved)
  }
  return next
}

export function markExported(protocol: Protocol): Protocol {
  if (
    protocol.status !== ProtocolStatus.ready &&
    protocol.status !== ProtocolStatus.exported
  ) {
    throw new DomainError(
      'В выгрузку включаются протоколы в статусе ready (повтор — exported)',
      'INVALID_STATUS',
    )
  }
  return withStatus(protocol, ProtocolStatus.exported)
}

export function markSent(protocol: Protocol): Protocol {
  if (protocol.status !== ProtocolStatus.exported) {
    throw new DomainError(
      'Отметить переданным можно только выгруженный протокол',
      'INVALID_STATUS',
    )
  }
  return withStatus(protocol, ProtocolStatus.sent)
}

export function assertCanDelete(protocol: Protocol): void {
  if (
    protocol.status === ProtocolStatus.exported ||
    protocol.status === ProtocolStatus.sent
  ) {
    throw new DomainError(
      'Удаление запрещено после выгрузки (exported/sent)',
      'DELETE_FORBIDDEN',
    )
  }
}

/** Клиентский патч не может содержать status — проверка на границе API. */
export function assertNoStatusInPatch(patch: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    throw new DomainError(
      'Прямое изменение статуса протокола запрещено. Используйте операции жизненного цикла.',
      'STATUS_IMMUTABLE',
    )
  }
}
