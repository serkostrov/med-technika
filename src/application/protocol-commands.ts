import type { Protocol, ProtocolEditablePatch, ProtocolIssue } from '@/domain'
import {
  DomainError,
  afterEditablePatch,
  approveProtocol,
  assertCanDelete,
  assertNoStatusInPatch,
  attachScan,
  detachScan,
  markExported,
  markSent,
  returnToReview,
  softDelete,
  type LifecycleActor,
} from '@/domain'
import type { CalendarDate, InstantUtc } from '@/domain'

/**
 * Единственная точка изменения протокола из UI/API.
 * Прямой присвоение protocol.status с клиента невозможно — поля нет в patch.
 */
export function applyProtocolUpdate(
  protocol: Protocol,
  patch: ProtocolEditablePatch,
): Protocol {
  assertNoStatusInPatch(patch as Record<string, unknown>)
  const merged: Protocol = {
    ...protocol,
    ...patch,
  }
  return afterEditablePatch(merged)
}

export function applyApprove(
  protocol: Protocol,
  issues: readonly ProtocolIssue[],
  actor: LifecycleActor,
): Protocol {
  return approveProtocol(protocol, issues, actor)
}

export function applyReturn(
  protocol: Protocol,
  actor: LifecycleActor,
  reason: string,
): Protocol {
  return returnToReview(protocol, actor, reason)
}

export function applyAttachScan(
  protocol: Protocol,
  scanPath: string,
  applicationDate?: CalendarDate | null,
): Protocol {
  return attachScan(protocol, scanPath, applicationDate)
}

export function applyDetachScan(protocol: Protocol): Protocol {
  return detachScan(protocol)
}

export function applyMarkExported(protocol: Protocol): Protocol {
  return markExported(protocol)
}

export function applyMarkSent(protocol: Protocol): Protocol {
  return markSent(protocol)
}

export function applySoftDelete(
  protocol: Protocol,
  at?: InstantUtc,
): Protocol {
  assertCanDelete(protocol)
  return softDelete(protocol, at)
}

/** Защита от «сырого» обновления статуса через общий JSON API. */
export function rejectClientStatusMutation(
  body: Record<string, unknown>,
): void {
  if ('status' in body) {
    throw new DomainError(
      'Прямое изменение статуса протокола запрещено',
      'STATUS_IMMUTABLE',
    )
  }
}
