import {
  ProtocolStatus,
  type Protocol,
  type ProtocolStatus as ProtocolStatusType,
} from '@/domain'
import type { Database } from '@/server/db/database'
import { isHead, ownsProtocol, type AuthContext } from '@/security'

export type ProtocolListQuickFilter =
  | 'not_sent'
  | 'with_errors'
  | 'no_scan'
  | 'no_application_date'

export type ProtocolListQuery = {
  number?: string
  customerId?: string
  customerName?: string
  object?: string
  serialNo?: string
  kindId?: number
  engineerStaffId?: string
  dateFrom?: string
  dateTo?: string
  status?: ProtocolStatusType | ''
  quick?: ProtocolListQuickFilter | ''
  page?: number
  pageSize?: number
}

export type ProtocolListRow = {
  id: string
  number: string
  protocolDate: string
  formTitle: string | null
  kindTitle: string | null
  customerName: string | null
  objectFullName: string | null
  measureStart: string | null
  measureEnd: string | null
  engineerName: string | null
  errorCount: number
  warningCount: number
  status: ProtocolStatusType
  hasScan: boolean
  exportedAt: string | null
}

export type ProtocolListCounters = {
  review: number
  approved: number
  ready: number
  exported: number
  sent: number
  notSent: number
}

export type ProtocolListResult = {
  items: ProtocolListRow[]
  total: number
  page: number
  pageSize: number
  counters: ProtocolListCounters
}

function normalize(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

function exportedAtForProtocol(db: Database, protocolId: string): string | null {
  const items = db.fgisExportItems.filter((i) => i.protocolId === protocolId)
  if (items.length === 0) return null
  let latest: string | null = null
  for (const item of items) {
    const exp = db.fgisExports.find((e) => e.id === item.exportId)
    if (!exp) continue
    if (!latest || exp.createdAt > latest) latest = exp.createdAt
  }
  return latest
}

function toRow(db: Database, p: Protocol): ProtocolListRow {
  const form = db.protocolForms.find((f) => f.id === p.formId)
  const kind =
    form?.kindId != null
      ? db.measurementKinds.find((k) => k.id === form.kindId)
      : undefined
  const customer = p.customerId
    ? db.customers.find((c) => c.id === p.customerId)
    : undefined
  const engineer = p.engineerStaffId
    ? db.staff.find((s) => s.id === p.engineerStaffId)
    : undefined
  const issues = db.protocolIssues.filter(
    (i) => i.protocolId === p.id && i.isActive,
  )

  return {
    id: p.id,
    number: p.number,
    protocolDate: p.protocolDate,
    formTitle: form?.title ?? null,
    kindTitle: kind?.title ?? null,
    customerName: customer?.name ?? null,
    objectFullName: p.objectFullName,
    measureStart: p.measureStart,
    measureEnd: p.measureEnd,
    engineerName: engineer?.shortName ?? engineer?.fullName ?? null,
    errorCount: issues.filter((i) => i.severity === 'error').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length,
    status: p.status,
    hasScan: Boolean(p.scanPath),
    exportedAt: exportedAtForProtocol(db, p.id),
  }
}

function matchesFilters(
  db: Database,
  p: Protocol,
  q: ProtocolListQuery,
): boolean {
  if (q.number?.trim()) {
    if (!normalize(p.number).includes(normalize(q.number))) return false
  }
  if (q.customerId) {
    if (p.customerId !== q.customerId) return false
  }
  if (q.customerName?.trim()) {
    const c = p.customerId
      ? db.customers.find((x) => x.id === p.customerId)
      : undefined
    const hay = `${c?.name ?? ''} ${(c?.nameAliases ?? []).join(' ')}`
    if (!normalize(hay).includes(normalize(q.customerName))) return false
  }
  if (q.object?.trim()) {
    if (!normalize(p.objectFullName).includes(normalize(q.object))) return false
  }
  if (q.serialNo?.trim()) {
    const serials = db.protocolObjects
      .filter((o) => o.protocolId === p.id)
      .map((o) => o.serialNo ?? '')
      .join(' ')
    if (!normalize(serials).includes(normalize(q.serialNo))) return false
  }
  if (q.kindId != null && Number.isFinite(q.kindId)) {
    const form = db.protocolForms.find((f) => f.id === p.formId)
    if (form?.kindId !== q.kindId) return false
  }
  if (q.engineerStaffId) {
    if (p.engineerStaffId !== q.engineerStaffId) return false
  }
  if (q.dateFrom) {
    if (p.protocolDate < q.dateFrom) return false
  }
  if (q.dateTo) {
    if (p.protocolDate > q.dateTo) return false
  }
  if (q.status) {
    if (p.status !== q.status) return false
  }

  switch (q.quick) {
    case 'not_sent':
      // Не передано во ФГИС = ещё не marked sent
      if (p.status === ProtocolStatus.sent) return false
      break
    case 'with_errors': {
      const hasErr = db.protocolIssues.some(
        (i) =>
          i.protocolId === p.id && i.isActive && i.severity === 'error',
      )
      if (!hasErr) return false
      break
    }
    case 'no_scan':
      if (p.scanPath) return false
      break
    case 'no_application_date':
      if (p.applicationDate) return false
      break
    default:
      break
  }

  return true
}

function computeCounters(
  protocols: readonly Protocol[],
): ProtocolListCounters {
  const counters: ProtocolListCounters = {
    review: 0,
    approved: 0,
    ready: 0,
    exported: 0,
    sent: 0,
    notSent: 0,
  }
  for (const p of protocols) {
    if (p.status === ProtocolStatus.review) counters.review += 1
    else if (p.status === ProtocolStatus.approved) counters.approved += 1
    else if (p.status === ProtocolStatus.ready) counters.ready += 1
    else if (p.status === ProtocolStatus.exported) counters.exported += 1
    else if (p.status === ProtocolStatus.sent) counters.sent += 1
    if (p.status !== ProtocolStatus.sent) counters.notSent += 1
  }
  return counters
}

/**
 * Серверный реестр: RLS → фильтры → счётчики → пагинация (ТЗ §11).
 */
export function queryProtocolList(
  db: Database,
  ctx: AuthContext,
  query: ProtocolListQuery = {},
): ProtocolListResult {
  const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 200)
  const page = Math.max(query.page ?? 1, 1)

  let scope = db.protocols.filter((p) => p.deletedAt === null)
  if (!isHead(ctx)) {
    scope = scope.filter((p) => ownsProtocol(ctx, p))
  }

  const counters = computeCounters(scope)

  const filtered = scope
    .filter((p) => matchesFilters(db, p, query))
    .sort((a, b) => {
      const byDate = b.protocolDate.localeCompare(a.protocolDate)
      if (byDate !== 0) return byDate
      return a.number.localeCompare(b.number, 'ru')
    })

  const total = filtered.length
  const start = (page - 1) * pageSize
  const pageItems = filtered.slice(start, start + pageSize).map((p) => toRow(db, p))

  return {
    items: pageItems,
    total,
    page,
    pageSize,
    counters,
  }
}

export function parseProtocolListQuery(
  params: URLSearchParams,
): ProtocolListQuery {
  const kindRaw = params.get('kindId')
  const pageRaw = params.get('page')
  const pageSizeRaw = params.get('pageSize')
  return {
    number: params.get('number') ?? undefined,
    customerId: params.get('customerId') ?? undefined,
    customerName: params.get('customerName') ?? undefined,
    object: params.get('object') ?? undefined,
    serialNo: params.get('serialNo') ?? undefined,
    kindId: kindRaw != null && kindRaw !== '' ? Number(kindRaw) : undefined,
    engineerStaffId: params.get('engineerStaffId') ?? undefined,
    dateFrom: params.get('dateFrom') ?? undefined,
    dateTo: params.get('dateTo') ?? undefined,
    status: (params.get('status') as ProtocolStatusType | null) ?? undefined,
    quick: (params.get('quick') as ProtocolListQuickFilter | null) ?? undefined,
    page: pageRaw ? Number(pageRaw) : undefined,
    pageSize: pageSizeRaw ? Number(pageSizeRaw) : undefined,
  }
}
