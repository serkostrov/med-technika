import {
  ProtocolStatus,
  type Protocol,
  type Setting,
} from '@/domain'
import type { Database } from '@/server/db/database'
import { protocolRunChecks } from '@/validation'
import { applyMarkExported } from '@/application/protocol-commands'
import {
  emitProtocolXml,
  wrapProtocolsDocument,
  type ProtocolXmlContext,
} from './emit-protocol'
import { validateAgainstFgisXsd } from './validate-xsd'

export type SkippedProtocol = {
  protocolId: string
  number: string
  reason: string
}

export type BuildFgisXmlResult = {
  exportId: string
  fileName: string
  filePath: string
  fileSize: number
  xml: string
  previewXml: string
  includedProtocolIds: string[]
  skipped: SkippedProtocol[]
}

export type BuildFgisXmlOptions = {
  protocolIds: string[]
  actorStaffId: string
  now?: Date
  /** Не менять статусы и не писать в fgis_exports (для preview/тестов). */
  dryRun?: boolean
}

function getSetting(settings: Setting[], key: string): unknown {
  return settings.find((s) => s.key === key)?.value
}

function formatExportFileName(now: Date, seq: number): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_` +
    `${pad(now.getHours())}${pad(now.getMinutes())}`
  return `fgis_${stamp}_${seq}.xml`
}

function buildContext(
  db: Database,
  protocol: Protocol,
  pdfBytes: ArrayBuffer | null,
  omitContent: boolean,
): ProtocolXmlContext | { error: string } {
  const form = db.protocolForms.find((f) => f.id === protocol.formId)
  if (!form) return { error: 'Форма протокола не найдена' }

  if (!protocol.customerId) return { error: 'Заказчик не сопоставлен' }
  const customer = db.customers.find((c) => c.id === protocol.customerId)
  if (!customer || customer.deletedAt) return { error: 'Заказчик не найден' }

  if (!protocol.engineerStaffId) return { error: 'Исполнитель не указан' }
  const engineer = db.staff.find((s) => s.id === protocol.engineerStaffId)
  if (!engineer?.fgisIdFullName) {
    return { error: 'Исполнитель без idFullName' }
  }

  const approverId = getSetting(db.settings, 'approver_staff_id')
  const approver = db.staff.find((s) => s.id === approverId)
  if (!approver?.fgisIdFullName) {
    return { error: 'Не настроен approver_staff_id / idFullName руководителя' }
  }

  const results = db.protocolResults.filter((r) => r.protocolId === protocol.id)
  if (results.filter((r) => r.includeInXml).length === 0) {
    return { error: 'Нет результатов для XML (include_in_xml)' }
  }

  const equipmentRows = db.protocolEquipment.filter(
    (e) => e.protocolId === protocol.id,
  )

  return {
    protocol,
    form,
    customer,
    engineer,
    approver,
    results,
    equipmentRows,
    equipmentById: new Map(db.equipment.map((e) => [e.id, e])),
    oaById: new Map(db.oaItems.map((i) => [i.id, i])),
    unitsBySymbol: new Map(db.units.map((u) => [u.symbol, u])),
    settings: db.settings,
    pdfBytes,
    omitContent,
  }
}

/**
 * Потоковая сборка XML ФГИС (ТЗ §10.1–10.2).
 * PDF читается по одному протоколу — не держим все Content в памяти сразу
 * (после эмита ссылка на bytes отпускается).
 */
export function buildFgisXmlPackage(
  db: Database,
  options: BuildFgisXmlOptions,
): BuildFgisXmlResult {
  const { protocolIds, actorStaffId, dryRun } = options
  const now = options.now ?? new Date()

  if (protocolIds.length === 0) {
    throw new Error('Не выбраны протоколы')
  }
  if (protocolIds.length > 100) {
    throw new Error('Не более 100 протоколов')
  }

  const skipped: SkippedProtocol[] = []
  const included: string[] = []
  const chunks: string[] = []
  const previewChunks: string[] = []

  for (const id of protocolIds) {
    const protocol = db.protocols.find((p) => p.id === id && p.deletedAt === null)
    if (!protocol) {
      skipped.push({
        protocolId: id,
        number: id,
        reason: 'Протокол не найден',
      })
      continue
    }

    if (
      protocol.status !== ProtocolStatus.ready &&
      protocol.status !== ProtocolStatus.exported
    ) {
      skipped.push({
        protocolId: id,
        number: protocol.number,
        reason: `Статус «${protocol.status}» — нужна ready или exported`,
      })
      continue
    }

    // повторные проверки перед генерацией
    protocolRunChecks(db, id)
    const activeErrors = db.protocolIssues.filter(
      (i) =>
        i.protocolId === id && i.isActive && i.severity === 'error',
    )
    if (activeErrors.length > 0) {
      skipped.push({
        protocolId: id,
        number: protocol.number,
        reason: activeErrors.map((e) => `${e.code}: ${e.message}`).join('; '),
      })
      continue
    }

    if (!protocol.scanPath) {
      skipped.push({
        protocolId: id,
        number: protocol.number,
        reason: 'Нет прикреплённого PDF-скана',
      })
      continue
    }

    const scan = db.protocolScans.get(protocol.scanPath)
    // берём bytes локально — после emit обнуляем ссылку
    let pdfBytes: ArrayBuffer | null = scan?.bytes ?? null
    if (!pdfBytes) {
      skipped.push({
        protocolId: id,
        number: protocol.number,
        reason: 'PDF скан не найден в защищённом хранилище',
      })
      continue
    }

    const ctxOrErr = buildContext(db, protocol, pdfBytes, false)
    if ('error' in ctxOrErr) {
      skipped.push({
        protocolId: id,
        number: protocol.number,
        reason: ctxOrErr.error,
      })
      pdfBytes = null
      continue
    }

    chunks.push(emitProtocolXml(ctxOrErr))
    // preview без Content — отдельный emit без удержания PDF
    previewChunks.push(
      emitProtocolXml({ ...ctxOrErr, pdfBytes: null, omitContent: true }),
    )
    included.push(id)
    // отпускаем PDF этого протокола
    pdfBytes = null
    ctxOrErr.pdfBytes = null
  }

  if (included.length === 0) {
    throw Object.assign(new Error('Ни один протокол не включён в XML'), {
      code: 'NO_PROTOCOLS',
      skipped,
    })
  }

  const xml = wrapProtocolsDocument(chunks)
  const previewXml = wrapProtocolsDocument(previewChunks)

  const xsd = validateAgainstFgisXsd(xml)
  if (!xsd.ok) {
    throw Object.assign(
      new Error(`Ошибка валидации XSD: ${xsd.errors.join('; ')}`),
      { code: 'XSD_INVALID', errors: xsd.errors, skipped },
    )
  }

  const fileSize = new TextEncoder().encode(xml).byteLength

  const seq =
    db.fgisExports.filter((e) => e.createdAt.startsWith(now.toISOString().slice(0, 10)))
      .length + 1
  const fileName = formatExportFileName(now, seq)
  const filePath = `fgis-exports/${fileName}`
  const exportId = crypto.randomUUID()

  if (!dryRun) {
    db.fgisExportFiles.set(filePath, {
      path: filePath,
      fileName,
      xml,
      previewXml,
      createdAt: now.toISOString(),
      createdBy: actorStaffId,
    })
    db.fgisExports.push({
      id: exportId,
      filePath,
      fileSize,
      protocolsCount: included.length,
      createdBy: actorStaffId,
      createdAt: now.toISOString(),
      uploadedMarkedBy: null,
      uploadedMarkedAt: null,
    })
    for (const pid of included) {
      db.fgisExportItems.push({ exportId, protocolId: pid })
      const p = db.protocols.find((x) => x.id === pid)!
      const idx = db.protocols.findIndex((x) => x.id === pid)
      db.protocols[idx] = applyMarkExported(p)
    }
  }

  return {
    exportId: dryRun ? 'dry-run' : exportId,
    fileName,
    filePath,
    fileSize,
    xml,
    previewXml,
    includedProtocolIds: included,
    skipped,
  }
}

/** Preview одного протокола без Content (вкладка XML). */
export function buildProtocolXmlPreview(
  db: Database,
  protocolId: string,
): string {
  const protocol = db.protocols.find(
    (p) => p.id === protocolId && p.deletedAt === null,
  )
  if (!protocol) return '<!-- протокол не найден -->'

  const ctxOrErr = buildContext(db, protocol, null, true)
  if ('error' in ctxOrErr) {
    return `<!-- ${ctxOrErr.error} -->`
  }
  return wrapProtocolsDocument([emitProtocolXml(ctxOrErr)])
}
