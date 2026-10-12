import type { AuditLogEntry, ProtocolIssue } from '@/domain'
import type { Database } from '@/server/db/database'
import { isHead, type AuthContext } from '@/security'
import { checkCodeLabel } from '@/shared/ui/labels'

/** Контекст места замечания/результата для журнала. */
export function describeIssueLocation(
  db: Database,
  issue: ProtocolIssue,
): string | null {
  const ref = issue.ref
  if (!ref) return null
  const parts: string[] = []
  const resultId =
    typeof ref.resultId === 'string'
      ? ref.resultId
      : typeof ref.result_id === 'string'
        ? ref.result_id
        : null
  if (resultId) {
    const result = db.protocolResults.find((r) => r.id === resultId)
    if (result) {
      const object = result.objectId
        ? db.protocolObjects.find((o) => o.id === result.objectId)
        : null
      if (object?.name) parts.push(object.name)
      const indicator = result.indicatorRaw || result.sourceKey
      if (indicator) parts.push(indicator)
    }
  }
  if (typeof ref.seq === 'number') {
    parts.push(`оборудование, строка ${ref.seq}`)
  }
  if (typeof ref.field === 'string') parts.push(String(ref.field))
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Дополняет diff человекочитаемым контекстом (для старых и новых записей).
 */
export function enrichAuditDiff(
  db: Database,
  entry: Pick<AuditLogEntry, 'entity' | 'entityId' | 'action' | 'diff'>,
): Record<string, unknown> | null {
  const base = entry.diff ? { ...entry.diff } : {}

  if (entry.entity === 'protocol_issues' && entry.entityId) {
    const issue = db.protocolIssues.find((i) => i.id === entry.entityId)
    if (issue) {
      if (!base.code) base.code = issue.code
      if (!base.message) base.message = issue.message
      if (!base.summary) {
        base.summary = `${checkCodeLabel(issue.code)} — ${issue.message}`
      }
      if (!base.where) {
        const where = describeIssueLocation(db, issue)
        if (where) base.where = where
      }
      if (base.comment === undefined && issue.ackComment) {
        base.comment = issue.ackComment
      }
    }
  }

  if (entry.entity === 'protocol_results' && entry.entityId) {
    const result = db.protocolResults.find((r) => r.id === entry.entityId)
    if (result) {
      if (!base.indicator) {
        base.indicator = result.indicatorRaw || result.sourceKey
      }
      if (!base.objectName && result.objectId) {
        const object = db.protocolObjects.find((o) => o.id === result.objectId)
        if (object?.name) base.objectName = object.name
      }
      if (entry.action === 'set_oa' && typeof base.oaItemId === 'string' && !base.oaItemNo) {
        const oa = db.oaItems.find((i) => i.id === base.oaItemId)
        if (oa) {
          base.oaItemNo = oa.itemNo
          base.oaIndicator = oa.indicatorText
        }
      }
    }
  }

  if (
    entry.entity === 'protocols' &&
    entry.action === 'set_equipment' &&
    typeof base.equipmentId === 'string' &&
    !base.equipmentName
  ) {
    const eq = db.equipment.find((e) => e.id === base.equipmentId)
    if (eq) base.equipmentName = eq.name
  }

  return Object.keys(base).length > 0 ? base : null
}

export type AuditListQuery = {
  entity?: string
  entityId?: string
  actor?: string
  action?: string
  dateFrom?: string
  dateTo?: string
  protocolId?: string
  page?: number
  pageSize?: number
}

export type AuditListRow = AuditLogEntry & {
  actorName: string | null
  label: string
}

export type AuditListResult = {
  items: AuditListRow[]
  total: number
  page: number
  pageSize: number
}

/** Человекочитаемые действия журнала (ТЗ §13). */
export function auditActionLabel(
  entity: string,
  action: string,
): string {
  if (entity === 'protocols' || entity.startsWith('protocol')) {
    switch (action) {
      case 'upload':
      case 'upload_save':
        return 'Загрузил'
      case 'replace_soft_delete':
      case 'replace':
        return 'Заменил'
      case 'update':
      case 'set_oa':
      case 'set_include':
      case 'set_equipment':
        return 'Изменил'
      case 'approve':
        return 'Утвердил'
      case 'return':
        return 'Вернул'
      case 'attach_scan':
        return 'Прикрепил скан'
      case 'detach_scan':
        return 'Удалил скан'
      case 'include_in_export':
        return 'Включил в выгрузку'
      case 'delete':
        return 'Удалил'
      default:
        break
    }
  }
  if (entity === 'protocol_issues' && action === 'acknowledge') {
    return 'Принял замечание'
  }
  if (entity === 'protocol_results') {
    if (action === 'set_oa' || action === 'set_include') return 'Изменил'
  }
  if (entity === 'fgis_exports') {
    if (action === 'build_xml') return 'Выгрузил'
    if (action === 'mark_uploaded') return 'Отметил переданным'
  }
  if (entity === 'settings') return 'Изменил настройку'
  if (entity.startsWith('form_') || entity.includes('import')) {
    return 'Изменил справочник'
  }
  switch (action) {
    case 'create':
    case 'import_create':
      return 'Создал'
    case 'update':
    case 'import_update':
      return 'Изменил'
    case 'soft_delete':
    case 'delete':
    case 'deactivate':
      return 'Удалил'
    case 'import':
    case 'import_batch':
      return 'Импортировал'
    case 'add_alias':
      return 'Добавил псевдоним'
    default:
      return 'Изменил'
  }
}

function relatedToProtocol(
  db: Database,
  entry: AuditLogEntry,
  protocolId: string,
): boolean {
  if (entry.entity === 'protocols' && entry.entityId === protocolId) return true
  if (
    entry.entity === 'protocol_issues' &&
    db.protocolIssues.some(
      (i) => i.id === entry.entityId && i.protocolId === protocolId,
    )
  ) {
    return true
  }
  if (
    entry.entity === 'protocol_results' &&
    db.protocolResults.some(
      (r) => r.id === entry.entityId && r.protocolId === protocolId,
    )
  ) {
    return true
  }
  if (entry.entity === 'fgis_exports' && entry.entityId) {
    return db.fgisExportItems.some(
      (i) => i.exportId === entry.entityId && i.protocolId === protocolId,
    )
  }
  return false
}

export function queryAuditLog(
  db: Database,
  ctx: AuthContext,
  query: AuditListQuery = {},
): AuditListResult {
  const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 200)
  const page = Math.max(query.page ?? 1, 1)

  let rows = [...db.auditLog]

  // engineer — только свои протоколы / свои действия
  if (!isHead(ctx)) {
    const ownProtocolIds = new Set(
      db.protocols
        .filter((p) => p.uploadedBy === ctx.staffId && !p.deletedAt)
        .map((p) => p.id),
    )
    rows = rows.filter((e) => {
      if (e.actor === ctx.staffId) return true
      if (e.entity === 'protocols' && e.entityId && ownProtocolIds.has(e.entityId)) {
        return true
      }
      if (e.entity === 'protocol_issues') {
        return db.protocolIssues.some(
          (i) => i.id === e.entityId && ownProtocolIds.has(i.protocolId),
        )
      }
      if (e.entity === 'protocol_results') {
        return db.protocolResults.some(
          (r) => r.id === e.entityId && ownProtocolIds.has(r.protocolId),
        )
      }
      if (e.entity === 'fgis_exports' && e.entityId) {
        return db.fgisExportItems.some(
          (i) => i.exportId === e.entityId && ownProtocolIds.has(i.protocolId),
        )
      }
      return false
    })
  }

  if (query.protocolId) {
    rows = rows.filter((e) => relatedToProtocol(db, e, query.protocolId!))
  }
  if (query.entity) {
    rows = rows.filter((e) => e.entity === query.entity)
  }
  if (query.entityId) {
    rows = rows.filter((e) => e.entityId === query.entityId)
  }
  if (query.actor) {
    rows = rows.filter((e) => e.actor === query.actor)
  }
  if (query.action) {
    rows = rows.filter((e) => e.action === query.action)
  }
  if (query.dateFrom) {
    rows = rows.filter((e) => e.at.slice(0, 10) >= query.dateFrom!)
  }
  if (query.dateTo) {
    rows = rows.filter((e) => e.at.slice(0, 10) <= query.dateTo!)
  }

  rows.sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)

  const total = rows.length
  const start = (page - 1) * pageSize
  const items: AuditListRow[] = rows.slice(start, start + pageSize).map((e) => ({
    ...e,
    diff: enrichAuditDiff(db, e),
    actorName:
      e.actor != null
        ? (db.staff.find((s) => s.id === e.actor)?.fullName ?? null)
        : null,
    label: auditActionLabel(e.entity, e.action),
  }))

  return { items, total, page, pageSize }
}

export function parseAuditListQuery(params: URLSearchParams): AuditListQuery {
  return {
    entity: params.get('entity') ?? undefined,
    entityId: params.get('entityId') ?? undefined,
    actor: params.get('actor') ?? undefined,
    action: params.get('action') ?? undefined,
    dateFrom: params.get('dateFrom') ?? undefined,
    dateTo: params.get('dateTo') ?? undefined,
    protocolId: params.get('protocolId') ?? undefined,
    page: params.get('page') ? Number(params.get('page')) : undefined,
    pageSize: params.get('pageSize')
      ? Number(params.get('pageSize'))
      : undefined,
  }
}
