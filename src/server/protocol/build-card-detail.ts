import { canApprove } from '@/domain'
import type { Database } from '@/server/db/database'
import type { ProtocolCardDetail, ProtocolResultView } from './card-types'
import { buildProtocolXmlPreview } from '@/fgis-xml'
import { auditActionLabel, enrichAuditDiff } from './audit-query'

export function buildProtocolCardDetail(
  db: Database,
  protocolId: string,
): ProtocolCardDetail | null {
  const protocol = db.protocols.find(
    (p) => p.id === protocolId && p.deletedAt === null,
  )
  if (!protocol) return null

  const form = db.protocolForms.find((f) => f.id === protocol.formId) ?? null
  const canEditMeasureDates = Boolean(form?.settings?.manualMeasureDates)

  const customer = protocol.customerId
    ? (db.customers.find((c) => c.id === protocol.customerId) ?? null)
    : null
  const engineer = protocol.engineerStaffId
    ? (db.staff.find((s) => s.id === protocol.engineerStaffId) ?? null)
    : null

  const objects = db.protocolObjects
    .filter((o) => o.protocolId === protocolId)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

  const objectNameById = new Map(objects.map((o) => [o.id, o.name]))

  const results: ProtocolResultView[] = db.protocolResults
    .filter((r) => r.protocolId === protocolId)
    .sort((a, b) => a.seq - b.seq)
    .map((r) => {
      const oa = r.oaItemId
        ? db.oaItems.find((i) => i.id === r.oaItemId)
        : undefined
      return {
        ...r,
        objectName: r.objectId
          ? (objectNameById.get(r.objectId) ?? null)
          : null,
        oaItemNo: oa?.itemNo ?? null,
        oaIndicatorText: oa?.indicatorText ?? null,
        oaRangeText: oa?.rangeText ?? null,
        oaRangeMin: oa?.rangeMin ?? null,
        oaRangeMax: oa?.rangeMax ?? null,
        oaUnitText: oa?.unitText ?? null,
      }
    })

  const equipment = db.protocolEquipment
    .filter((e) => e.protocolId === protocolId)
    .sort((a, b) => a.seq - b.seq)
    .map((pe) => {
      const eq = pe.equipmentId
        ? db.equipment.find((e) => e.id === pe.equipmentId)
        : undefined
      const vers = eq
        ? db.equipmentVerifications.filter(
            (v) => v.equipmentId === eq.id && v.deletedAt === null,
          )
        : []
      return {
        ...pe,
        equipmentName: eq?.name ?? null,
        fgisEquipmentId: eq?.fgisEquipmentId ?? null,
        serialNo: eq?.serialNo ?? null,
        verifications: vers.map((v) => ({ ...v })),
      }
    })

  const staffName = (id: string | null) =>
    id ? (db.staff.find((s) => s.id === id)?.fullName ?? null) : null

  const issues = db.protocolIssues
    .filter((i) => i.protocolId === protocolId && i.isActive)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((i) => ({
      ...i,
      acknowledgedByName: staffName(i.acknowledgedBy),
    }))

  const audit = db.auditLog
    .filter(
      (a) =>
        (a.entity === 'protocols' && a.entityId === protocolId) ||
        (a.entity === 'protocol_issues' &&
          db.protocolIssues.some(
            (i) => i.id === a.entityId && i.protocolId === protocolId,
          )) ||
        (a.entity === 'protocol_results' &&
          db.protocolResults.some(
            (r) => r.id === a.entityId && r.protocolId === protocolId,
          )) ||
        (a.entity === 'fgis_exports' &&
          a.entityId != null &&
          db.fgisExportItems.some(
            (i) => i.exportId === a.entityId && i.protocolId === protocolId,
          )),
    )
    .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
    .map((a) => ({
      ...a,
      diff: enrichAuditDiff(db, a),
      actorName: staffName(a.actor),
      label: auditActionLabel(a.entity, a.action),
    }))

  const approvalCheck = canApprove(protocol, issues)
  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warningCount = issues.filter((i) => i.severity === 'warning').length
  const unackedWarningCount = issues.filter(
    (i) => i.severity === 'warning' && i.acknowledgedAt === null,
  ).length

  const scanStored = protocol.scanPath
    ? db.protocolScans.get(protocol.scanPath)
    : undefined

  return {
    protocol: { ...protocol },
    form: form ? { ...form } : null,
    canEditMeasureDates,
    customer: customer ? { ...customer } : null,
    engineer: engineer ? { ...engineer } : null,
    objects: objects.map((o) => ({ ...o })),
    results,
    equipment,
    issues,
    audit,
    lookups: {
      customers: db.customers
        .filter((c) => !c.deletedAt)
        .map((c) => ({ id: c.id, name: c.name, inn: c.inn })),
      staff: db.staff
        .filter((s) => !s.deletedAt && s.isActive)
        .map((s) => ({
          id: s.id,
          fullName: s.fullName,
          shortName: s.shortName,
          fgisIdFullName: s.fgisIdFullName,
        })),
      oaItems: db.oaItems
        .filter((i) => !i.deletedAt)
        .map((i) => ({
          id: i.id,
          itemNo: i.itemNo,
          indicatorText: i.indicatorText,
          rangeText: i.rangeText,
          unitText: i.unitText,
          editionId: i.editionId,
        })),
      equipment: db.equipment
        .filter((e) => !e.deletedAt && e.isActive)
        .map((e) => ({
          id: e.id,
          name: e.name,
          serialNo: e.serialNo,
          fgisEquipmentId: e.fgisEquipmentId,
          kind: e.kind,
        })),
    },
    xmlPreview: buildProtocolXmlPreview(db, protocolId),
    approval: {
      canApprove: approvalCheck.ok,
      blockReason: approvalCheck.ok ? null : approvalCheck.reason,
      errorCount,
      warningCount,
      unackedWarningCount,
    },
    scan: {
      path: protocol.scanPath,
      fileName: scanStored?.fileName ?? null,
      sizeBytes: scanStored?.bytes.byteLength ?? null,
    },
  }
}
