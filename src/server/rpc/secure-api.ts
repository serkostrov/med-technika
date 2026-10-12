import {
  applyApprove,
  applyAttachScan,
  applyDetachScan,
  applyMarkSent,
  applyProtocolUpdate,
  applyReturn,
  applySoftDelete,
  rejectClientStatusMutation,
} from '@/application/protocol-commands'
import {
  DomainError,
  ProtocolStatus,
  type Protocol,
  type ProtocolEditablePatch,
  type ProtocolIssue,
  type Setting,
} from '@/domain'
import {
  authorize,
  forbidden,
  isHead,
  notFound,
  ownsProtocol,
  SecuredOperation,
  type AuthContext,
} from '@/security'
import { AuthService, type PublicAccount } from '@/server/auth/auth-service'
import type { Database } from '@/server/db/database'
import {
  DictionaryService,
  type ExcelRow,
  type FsaCatalog,
} from '@/dictionaries'
import type { OaEditionKind } from '@/domain'
import type { OaImportPreview } from '@/dictionaries/import/oa'
import type { StaffImportPreview } from '@/dictionaries/import/staff'
import type { EquipmentImportPreview } from '@/dictionaries/import/equipment'
import type { UnitsImportPreview } from '@/dictionaries/import/units'
import type { FsaImportPreview } from '@/dictionaries/import/fsa'
import type {
  Customer,
  Equipment,
  EquipmentVerification,
  FormIndicatorMap,
  ProtocolForm,
  Unit,
  UnitConversion,
} from '@/domain'
import { ProtocolLocks } from '@/server/concurrency/protocol-locks'
import { ProtocolUploadService } from '@/parser/upload-service'
import { describeIssueLocation } from '@/server/protocol/audit-query'
import { checkCodeLabel } from '@/shared/ui/labels'
import type { ParsedProtocol } from '@/parser'
import {
  applyIndicatorMapsToProtocol,
  confirmIndicatorMapping,
  protocolRunChecks,
  rerunChecksForActiveProtocols,
} from '@/validation'
import { buildProtocolCardDetail } from '@/server/protocol/build-card-detail'
import type {
  CardEditablePatch,
  ProtocolCardDetail,
} from '@/server/protocol/card-types'
import {
  buildFgisXmlPackage,
  buildProtocolXmlPreview,
  type BuildFgisXmlResult,
} from '@/fgis-xml'
import {
  queryProtocolList,
  type ProtocolListQuery,
  type ProtocolListResult,
} from '@/server/protocol/list-query'
import {
  queryAuditLog,
  type AuditListQuery,
  type AuditListResult,
} from '@/server/protocol/audit-query'
import {
  abortUpload,
  createPendingUpload,
  putChunk,
  takeAssembledUpload,
  type UploadPurpose,
} from '@/server/upload/chunked-upload'

/**
 * Серверный API: каждая операция проверяет политики до доступа к данным.
 * UI-скрытие кнопок не является механизмом безопасности.
 */
export class SecureApi {
  readonly auth: AuthService
  readonly dictionaries: DictionaryService
  readonly uploads: ProtocolUploadService
  private readonly db: Database
  private readonly locks = new ProtocolLocks()

  constructor(db: Database) {
    this.db = db
    this.auth = new AuthService(db)
    this.dictionaries = new DictionaryService(db, (entity, entityId, action, diff) => {
      this.writeAudit(null, entity, entityId, action, diff)
    })
    this.uploads = new ProtocolUploadService(
      db,
      db.protocolSources,
      (actor, entity, entityId, action, diff) => {
        this.writeAudit(actor, entity, entityId, action, diff)
      },
    )
  }

  private writeAudit(
    actorStaffId: string | null,
    entity: string,
    entityId: string | null,
    action: string,
    diff: Record<string, unknown> | null,
  ): void {
    this.db.auditLog.push({
      id: this.db.auditSeq++,
      entity,
      entityId,
      action,
      actor: actorStaffId,
      at: new Date().toISOString(),
      diff,
    })
  }

  private dictFor(ctx: AuthContext): DictionaryService {
    return new DictionaryService(this.db, (entity, entityId, action, diff) => {
      this.writeAudit(ctx.staffId, entity, entityId, action, diff)
    })
  }


  login(email: string, password: string) {
    return this.auth.login(email, password)
  }

  selfRegister(): never {
    return this.auth.selfRegister()
  }

  async createUser(
    ctx: AuthContext,
    input: { email: string; password: string; staffId: string },
  ): Promise<PublicAccount> {
    authorize(ctx, SecuredOperation.userCreate)
    return this.auth.createAccount(ctx, input)
  }

  async setUserPassword(
    ctx: AuthContext,
    input: { staffId: string; password: string },
  ): Promise<PublicAccount> {
    authorize(ctx, SecuredOperation.userCreate)
    return this.auth.setPassword(ctx, input)
  }

  listUsers(ctx: AuthContext): PublicAccount[] {
    authorize(ctx, SecuredOperation.userList)
    return this.auth.listAccounts(ctx)
  }

  listProtocols(
    ctx: AuthContext,
    query: ProtocolListQuery = {},
  ): ProtocolListResult {
    authorize(ctx, SecuredOperation.protocolList)
    return queryProtocolList(this.db, ctx, query)
  }

  /** @deprecated тонкий список без joins — оставлен для совместимости тестов */
  listProtocolEntities(ctx: AuthContext): Protocol[] {
    authorize(ctx, SecuredOperation.protocolList)
    const active = this.db.protocols.filter((p) => p.deletedAt === null)
    if (isHead(ctx)) return active.map(clone)
    return active.filter((p) => ownsProtocol(ctx, p)).map(clone)
  }

  getProtocol(ctx: AuthContext, protocolId: string): Protocol {
    const protocol = this.requireProtocol(protocolId)
    authorize(ctx, SecuredOperation.protocolGet, { protocol })
    return clone(protocol)
  }

  getProtocolDetail(ctx: AuthContext, protocolId: string): ProtocolCardDetail {
    const protocol = this.requireProtocol(protocolId)
    authorize(ctx, SecuredOperation.protocolGet, { protocol })
    const detail = buildProtocolCardDetail(this.db, protocolId)
    if (!detail) notFound('Протокол не найден')
    return detail
  }

  updateProtocol(
    ctx: AuthContext,
    protocolId: string,
    patch: ProtocolEditablePatch | Record<string, unknown>,
  ): Protocol {
    rejectClientStatusMutation(patch as Record<string, unknown>)
    const protocol = this.requireProtocol(protocolId)
    authorize(ctx, SecuredOperation.protocolUpdate, { protocol })

    const safe = sanitizeCardPatch(this.db, protocol, patch as ProtocolEditablePatch)
    const next = applyProtocolUpdate(protocol, safe)
    this.replaceProtocol(next)
    protocolRunChecks(this.db, protocol.id)
    this.audit(
      ctx,
      'protocols',
      protocol.id,
      'update',
      safe as Record<string, unknown>,
    )
    return clone(next)
  }

  saveProtocol(
    ctx: AuthContext,
    input: {
      number: string
      protocolDate: string
      formId: string
      sourcePath: string
      sourceSha256: string
      engineerStaffId?: string | null
    },
  ): Protocol {
    authorize(ctx, SecuredOperation.protocolSave)

    const protocol: Protocol = {
      id: crypto.randomUUID(),
      number: input.number,
      protocolDate: input.protocolDate,
      measureStart: null,
      measureEnd: null,
      modelGetDate: null,
      applicationDate: null,
      formId: input.formId,
      customerId: null,
      raw: {},
      objectFullName: null,
      measurePlace: null,
      measureAddress: null,
      territoryFeature: null,
      customerPhone: null,
      conditions: null,
      engineerStaffId: input.engineerStaffId ?? ctx.staffId,
      accredScope353: false,
      status: ProtocolStatus.review,
      sourcePath: input.sourcePath,
      sourceSha256: input.sourceSha256,
      parserVersion: null,
      scanPath: null,
      uploadedBy: ctx.staffId,
      uploadedAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
      deletedAt: null,
    }
    this.db.protocols.push(protocol)
    this.audit(ctx, 'protocols', protocol.id, 'upload', null)
    return clone(protocol)
  }

  initChunkedUpload(
    ctx: AuthContext,
    input: { fileName: string; totalBytes: number; purpose: UploadPurpose },
  ): { uploadId: string; chunkSize: number; totalChunks: number } {
    const session = createPendingUpload(ctx.staffId, input)
    this.db.pendingUploads.set(session.id, session)
    return {
      uploadId: session.id,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
    }
  }

  putUploadChunk(
    ctx: AuthContext,
    input: { uploadId: string; chunkIndex: number; contentBase64: string },
  ): { receivedChunks: number; totalChunks: number; complete: boolean } {
    return putChunk(this.db.pendingUploads, ctx.staffId, input)
  }

  abortChunkedUpload(ctx: AuthContext, uploadId: string): void {
    abortUpload(this.db.pendingUploads, ctx.staffId, uploadId)
  }

  async parseProtocolUpload(
    ctx: AuthContext,
    input: {
      fileName?: string
      /** Готовый файл целиком (тесты / мелкие файлы). */
      contentBase64?: string | null
      /** Итог почанковой загрузки. */
      uploadId?: string | null
      preferredSheetName?: string | null
    },
  ) {
    const data = this.resolveUploadBytes(ctx, {
      fileName: input.fileName ?? 'protocol.xlsx',
      contentBase64: input.contentBase64,
      uploadId: input.uploadId,
      purpose: 'protocol_source',
    })
    return this.uploads.parseUpload(
      ctx,
      data.fileName,
      data.bytes,
      input.preferredSheetName,
    )
  }

  saveParsedProtocol(
    ctx: AuthContext,
    input: {
      sourcePath: string
      sha256: string
      parsed: ParsedProtocol
      replaceProtocolId?: string | null
      customerId?: string | null
      createCustomer?: boolean
    },
  ): Protocol {
    return this.uploads.saveParsed(ctx, input)
  }

  /** RPC protocol_run_checks — полный набор E/W (ТЗ §8). */
  runProtocolChecks(ctx: AuthContext, protocolId: string): ProtocolIssue[] {
    const protocol = this.requireProtocol(protocolId)
    authorize(ctx, SecuredOperation.protocolUpdate, { protocol })
    protocolRunChecks(this.db, protocolId)
    return this.db.protocolIssues.filter(
      (i) => i.protocolId === protocolId && i.isActive,
    )
  }

  /**
   * Ловушка для обхода UI: прямое присвоение status.
   * Политика всегда FORBIDDEN (в т.ч. для head).
   */
  directSetStatus(ctx: AuthContext, protocolId: string, _status: string): never {
    const protocol = this.db.protocols.find((p) => p.id === protocolId)
    authorize(ctx, SecuredOperation.protocolDirectStatusUpdate, {
      protocol: protocol ?? undefined,
    })
    forbidden('unreachable')
  }

  approveProtocol(ctx: AuthContext, protocolId: string): Protocol {
    return this.locks.withLock([protocolId], () => {
      const protocol = this.requireProtocol(protocolId)
      authorize(ctx, SecuredOperation.protocolApprove, { protocol })
      const issues = this.db.protocolIssues.filter((i) => i.protocolId === protocolId)
      const next = applyApprove(protocol, issues, {
        staffId: ctx.staffId,
        isHead: isHead(ctx),
      })
      this.replaceProtocol(next)
      this.audit(ctx, 'protocols', protocol.id, 'approve', null)
      return clone(next)
    })
  }

  returnProtocol(ctx: AuthContext, protocolId: string, reason: string): Protocol {
    const protocol = this.requireProtocol(protocolId)
    authorize(ctx, SecuredOperation.protocolReturn, { protocol })
    const next = applyReturn(
      protocol,
      { staffId: ctx.staffId, isHead: isHead(ctx) },
      reason,
    )
    this.replaceProtocol(next)
    this.audit(ctx, 'protocols', protocol.id, 'return', { reason })
    return clone(next)
  }

  attachScan(ctx: AuthContext, protocolId: string, scanPath: string): Protocol {
    const protocol = this.requireProtocol(protocolId)
    authorize(ctx, SecuredOperation.protocolAttachScan, { protocol })
    const next = applyAttachScan(protocol, scanPath)
    this.replaceProtocol(next)
    this.audit(ctx, 'protocols', protocol.id, 'attach_scan', { scanPath })
    return clone(next)
  }

  /**
   * Прикрепление PDF-скана: только PDF, без лимита размера (чанковая загрузка).
   * При approved + PDF + дата заявки → ready.
   */
  attachScanPdf(
    ctx: AuthContext,
    protocolId: string,
    input: {
      fileName?: string
      contentBase64?: string | null
      uploadId?: string | null
    },
  ): Protocol {
    const protocol = this.requireProtocol(protocolId)
    authorize(ctx, SecuredOperation.protocolAttachScan, { protocol })

    const assembled = this.resolveUploadBytes(ctx, {
      fileName: input.fileName?.trim() || 'scan.pdf',
      contentBase64: input.contentBase64,
      uploadId: input.uploadId,
      purpose: 'protocol_scan',
    })
    const fileName = assembled.fileName
    if (!/\.pdf$/i.test(fileName)) {
      throw new DomainError('Допускается только PDF', 'SCAN_NOT_PDF')
    }

    const bytes = new Uint8Array(assembled.bytes)
    if (bytes.byteLength < 5) {
      throw new DomainError('Файл не является PDF', 'SCAN_NOT_PDF')
    }
    const header = String.fromCharCode(
      bytes[0]!,
      bytes[1]!,
      bytes[2]!,
      bytes[3]!,
      bytes[4]!,
    )
    if (header !== '%PDF-') {
      throw new DomainError('Файл не является PDF', 'SCAN_NOT_PDF')
    }

    const path = `protocol-scans/${protocolId}/${crypto.randomUUID()}.pdf`
    this.db.protocolScans.set(path, {
      path,
      fileName,
      bytes: assembled.bytes,
      uploadedAt: new Date().toISOString(),
      uploadedBy: ctx.staffId,
    })

    const next = applyAttachScan(protocol, path)
    this.replaceProtocol(next)
    this.audit(ctx, 'protocols', protocol.id, 'attach_scan', {
      scanPath: path,
      fileName,
      sizeBytes: bytes.byteLength,
    })
    return clone(next)
  }

  getScanPdf(
    ctx: AuthContext,
    protocolId: string,
  ): { fileName: string; bytes: ArrayBuffer } {
    const protocol = this.requireProtocol(protocolId)
    authorize(ctx, SecuredOperation.protocolGet, { protocol })
    if (!protocol.scanPath) {
      throw new DomainError('Скан не прикреплён', 'SCAN_MISSING')
    }
    const stored = this.db.protocolScans.get(protocol.scanPath)
    if (!stored) {
      throw new DomainError('Файл скана не найден', 'SCAN_MISSING')
    }
    return { fileName: stored.fileName, bytes: stored.bytes }
  }

  detachScanPdf(ctx: AuthContext, protocolId: string): Protocol {
    const protocol = this.requireProtocol(protocolId)
    authorize(ctx, SecuredOperation.protocolAttachScan, { protocol })
    const path = protocol.scanPath
    const next = applyDetachScan(protocol)
    this.replaceProtocol(next)
    if (path) this.db.protocolScans.delete(path)
    this.audit(ctx, 'protocols', protocol.id, 'detach_scan', {
      scanPath: path,
    })
    return clone(next)
  }

  private resolveUploadBytes(
    ctx: AuthContext,
    input: {
      fileName: string
      contentBase64?: string | null
      uploadId?: string | null
      purpose: UploadPurpose
    },
  ): { fileName: string; bytes: ArrayBuffer } {
    if (input.uploadId) {
      return takeAssembledUpload(
        this.db.pendingUploads,
        ctx.staffId,
        input.uploadId,
        input.purpose,
      )
    }
    if (input.contentBase64 != null && input.contentBase64 !== '') {
      try {
        const raw = atob(input.contentBase64)
        const bytes = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
        return {
          fileName: input.fileName,
          bytes: bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        }
      } catch {
        throw new DomainError('Повреждённые данные файла', 'UPLOAD_INVALID')
      }
    }
    throw new DomainError('Не передан файл', 'UPLOAD_EMPTY')
  }

  setResultOa(
    ctx: AuthContext,
    resultId: string,
    oaItemId: string,
  ): ProtocolCardDetail {
    const result = this.db.protocolResults.find((r) => r.id === resultId)
    if (!result) notFound('Результат не найден')
    const protocol = this.requireProtocol(result.protocolId)
    authorize(ctx, SecuredOperation.protocolUpdate, { protocol })

    const oa = this.db.oaItems.find((i) => i.id === oaItemId && !i.deletedAt)
    if (!oa) notFound('Позиция ОА не найдена')

    result.oaItemId = oaItemId
    confirmIndicatorMapping(this.db, {
      formId: protocol.formId,
      sourceKey: result.sourceKey,
      oaItemId,
      ub:
        this.db.formIndicatorMaps.find(
          (m) =>
            m.formId === protocol.formId && m.sourceKey === result.sourceKey,
        )?.ub ?? null,
    })

    const demoted = applyProtocolUpdate(protocol, {})
    this.replaceProtocol(demoted)
    protocolRunChecks(this.db, protocol.id)
    const object = result.objectId
      ? this.db.protocolObjects.find((o) => o.id === result.objectId)
      : null
    this.audit(ctx, 'protocol_results', resultId, 'set_oa', {
      oaItemId,
      oaItemNo: oa.itemNo,
      oaIndicator: oa.indicatorText,
      indicator: result.indicatorRaw || result.sourceKey,
      objectName: object?.name ?? null,
    })
    return this.getProtocolDetail(ctx, protocol.id)
  }

  setResultInclude(
    ctx: AuthContext,
    resultId: string,
    includeInXml: boolean,
    comment: string,
  ): ProtocolCardDetail {
    if (!comment?.trim()) {
      throw new DomainError(
        'Для изменения include_in_xml обязателен комментарий',
        'COMMENT_REQUIRED',
      )
    }
    const result = this.db.protocolResults.find((r) => r.id === resultId)
    if (!result) notFound('Результат не найден')
    const protocol = this.requireProtocol(result.protocolId)
    authorize(ctx, SecuredOperation.protocolUpdate, { protocol })

    result.includeInXml = includeInXml
    const demoted = applyProtocolUpdate(protocol, {})
    this.replaceProtocol(demoted)
    protocolRunChecks(this.db, protocol.id)
    const object = result.objectId
      ? this.db.protocolObjects.find((o) => o.id === result.objectId)
      : null
    this.audit(ctx, 'protocol_results', resultId, 'set_include', {
      includeInXml,
      comment: comment.trim(),
      indicator: result.indicatorRaw || result.sourceKey,
      objectName: object?.name ?? null,
    })
    return this.getProtocolDetail(ctx, protocol.id)
  }

  setProtocolEquipment(
    ctx: AuthContext,
    protocolId: string,
    seq: number,
    equipmentId: string | null,
  ): ProtocolCardDetail {
    const protocol = this.requireProtocol(protocolId)
    authorize(ctx, SecuredOperation.protocolUpdate, { protocol })
    const pe = this.db.protocolEquipment.find(
      (e) => e.protocolId === protocolId && e.seq === seq,
    )
    if (!pe) notFound('Строка оборудования не найдена')
    let equipmentName: string | null = null
    if (equipmentId) {
      const eq = this.db.equipment.find((e) => e.id === equipmentId && !e.deletedAt)
      if (!eq) notFound('СИ не найдено в справочнике')
      equipmentName = eq.name
    }
    pe.equipmentId = equipmentId
    const demoted = applyProtocolUpdate(protocol, {})
    this.replaceProtocol(demoted)
    protocolRunChecks(this.db, protocol.id)
    this.audit(ctx, 'protocols', protocolId, 'set_equipment', {
      seq,
      equipmentId,
      equipmentName: equipmentName ?? 'снято',
      rawText: pe.rawText,
    })
    return this.getProtocolDetail(ctx, protocolId)
  }

  deleteProtocol(ctx: AuthContext, protocolId: string): void {
    this.locks.withLock([protocolId], () => {
      const protocol = this.requireProtocol(protocolId)
      authorize(ctx, SecuredOperation.protocolDelete, { protocol })
      const next = applySoftDelete(protocol)
      this.replaceProtocol(next)
      this.audit(ctx, 'protocols', protocol.id, 'delete', null)
    })
  }

  acknowledgeIssue(
    ctx: AuthContext,
    issueId: string,
    comment: string | null,
  ): ProtocolIssue {
    const issue = this.db.protocolIssues.find((i) => i.id === issueId)
    if (!issue || !issue.isActive) notFound('Замечание не найдено')
    const protocol = this.requireProtocol(issue.protocolId)
    authorize(ctx, SecuredOperation.issueAcknowledge, { protocol })
    if (issue.severity !== 'warning') {
      forbidden('К сведению можно принять только замечание (warning)')
    }
    // комментарий необязателен (ТЗ §9)
    issue.acknowledgedBy = ctx.staffId
    issue.acknowledgedAt = new Date().toISOString()
    issue.ackComment = comment?.trim() || null
    const where = describeIssueLocation(this.db, issue)
    this.audit(ctx, 'protocol_issues', issue.id, 'acknowledge', {
      summary: `${checkCodeLabel(issue.code)} — ${issue.message}`,
      code: issue.code,
      message: issue.message,
      where,
      comment: issue.ackComment,
    })
    return { ...issue }
  }

  buildFgisXml(
    ctx: AuthContext,
    protocolIds: string[],
  ): BuildFgisXmlResult {
    authorize(ctx, SecuredOperation.fgisBuildXml)
    return this.locks.withLock(protocolIds, () => {
      try {
        const result = buildFgisXmlPackage(this.db, {
          protocolIds,
          actorStaffId: ctx.staffId,
        })
        this.audit(ctx, 'fgis_exports', result.exportId, 'build_xml', {
          protocolIds: result.includedProtocolIds,
          skipped: result.skipped,
          fileName: result.fileName,
        })
        for (const protocolId of result.includedProtocolIds) {
          this.audit(ctx, 'protocols', protocolId, 'include_in_export', {
            exportId: result.exportId,
            fileName: result.fileName,
          })
        }
        return result
      } catch (err) {
        const e = err as Error & {
          code?: string
          skipped?: unknown
          errors?: string[]
        }
        if (e.code === 'XSD_INVALID' || e.code === 'NO_PROTOCOLS') {
          forbidden(e.message)
        }
        throw err
      }
    })
  }

  getFgisExport(
    ctx: AuthContext,
    exportId: string,
  ): {
    export: {
      id: string
      filePath: string
      fileSize: number | null
      protocolsCount: number | null
      createdBy: string | null
      createdAt: string
      uploadedMarkedBy: string | null
      uploadedMarkedAt: string | null
    }
    fileName: string
    xml: string
    previewXml: string
  } {
    authorize(ctx, SecuredOperation.fgisBuildXml)
    const exp = this.db.fgisExports.find((e) => e.id === exportId)
    if (!exp) notFound('Выгрузка не найдена')
    const file = this.db.fgisExportFiles.get(exp.filePath)
    if (!file) notFound('Файл выгрузки не найден')
    return {
      export: { ...exp },
      fileName: file.fileName,
      xml: file.xml,
      previewXml: file.previewXml,
    }
  }

  listFgisExports(ctx: AuthContext) {
    authorize(ctx, SecuredOperation.fgisBuildXml)
    return this.db.fgisExports
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((e) => ({
        ...e,
        createdByName:
          e.createdBy != null
            ? (this.db.staff.find((s) => s.id === e.createdBy)?.fullName ??
              null)
            : null,
        fileName:
          this.db.fgisExportFiles.get(e.filePath)?.fileName ??
          e.filePath.split('/').pop() ??
          e.filePath,
      }))
  }

  listAudit(ctx: AuthContext, query: AuditListQuery = {}): AuditListResult {
    authorize(ctx, SecuredOperation.auditRead)
    return queryAuditLog(this.db, ctx, query)
  }

  previewProtocolXml(ctx: AuthContext, protocolId: string): { xml: string } {
    const protocol = this.requireProtocol(protocolId)
    authorize(ctx, SecuredOperation.protocolGet, { protocol })
    return { xml: buildProtocolXmlPreview(this.db, protocolId) }
  }

  markExportUploaded(ctx: AuthContext, exportId: string): void {
    authorize(ctx, SecuredOperation.fgisMarkUploaded)
    const exp = this.db.fgisExports.find((e) => e.id === exportId)
    if (!exp) notFound('Выгрузка не найдена')
    exp.uploadedMarkedBy = ctx.staffId
    exp.uploadedMarkedAt = new Date().toISOString()
    const items = this.db.fgisExportItems.filter((i) => i.exportId === exportId)
    for (const item of items) {
      const p = this.requireProtocol(item.protocolId)
      this.replaceProtocol(applyMarkSent(p))
    }
    this.audit(ctx, 'fgis_exports', exportId, 'mark_uploaded', null)
  }

  listStaff(ctx: AuthContext) {
    authorize(ctx, SecuredOperation.dictionaryRead)
    return this.dictFor(ctx).snapshot().staff
  }

  getDictionarySnapshot(ctx: AuthContext) {
    authorize(ctx, SecuredOperation.dictionaryRead)
    return this.dictFor(ctx).snapshot()
  }

  getSettings(ctx: AuthContext): Setting[] {
    authorize(ctx, SecuredOperation.settingsRead)
    return this.dictFor(ctx).snapshot().settings
  }

  writeSetting(ctx: AuthContext, key: string, value: unknown): Setting {
    authorize(ctx, SecuredOperation.settingsWrite)
    return this.dictFor(ctx).writeSetting(key, value)
  }

  createCustomerOnUpload(
    ctx: AuthContext,
    input: { name: string; inn?: string | null; ogrn?: string | null },
  ): Customer {
    authorize(ctx, SecuredOperation.customerCreateOnUpload)
    return this.dictFor(ctx).upsertCustomer(input)
  }

  createCustomer(
    ctx: AuthContext,
    input: Parameters<DictionaryService['createCustomer']>[0],
  ): Customer {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).createCustomer(input)
  }

  updateCustomer(
    ctx: AuthContext,
    customerId: string,
    patch: Partial<
      Pick<
        Customer,
        | 'name'
        | 'nameAliases'
        | 'inn'
        | 'ogrn'
        | 'phone'
        | 'email'
        | 'legalAddress'
        | 'actualAddress'
        | 'kindId'
      >
    >,
  ): Customer {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const result = this.dictFor(ctx).updateCustomerById(customerId, patch)
    rerunChecksForActiveProtocols(this.db)
    return result
  }

  deleteCustomer(ctx: AuthContext, customerId: string): void {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    this.dictFor(ctx).softDeleteCustomer(customerId)
    rerunChecksForActiveProtocols(this.db)
  }

  addCustomerAlias(ctx: AuthContext, customerId: string, alias: string): Customer {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).addCustomerAlias(customerId, alias)
  }

  // ── Dictionary imports (preview → commit) ─────────────

  previewOaImport(ctx: AuthContext, rows: ExcelRow[], sourceFile: string | null) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).previewOa(rows, sourceFile)
  }

  commitOaImport(
    ctx: AuthContext,
    preview: OaImportPreview,
    segmentKinds: OaEditionKind[],
  ) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const result = this.dictFor(ctx).commitOaImport(preview, segmentKinds)
    rerunChecksForActiveProtocols(this.db)
    return result
  }

  previewStaffImport(ctx: AuthContext, rows: ExcelRow[], sourceFile: string | null) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).previewStaff(rows, sourceFile)
  }

  commitStaffImport(ctx: AuthContext, preview: StaffImportPreview) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const result = this.dictFor(ctx).commitStaffImport(preview)
    rerunChecksForActiveProtocols(this.db)
    return result
  }

  previewEquipmentImport(
    ctx: AuthContext,
    rows: ExcelRow[],
    sourceFile: string | null,
  ) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).previewEquipment(rows, sourceFile)
  }

  commitEquipmentImport(ctx: AuthContext, preview: EquipmentImportPreview) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const result = this.dictFor(ctx).commitEquipmentImport(preview)
    rerunChecksForActiveProtocols(this.db)
    return result
  }

  previewUnitsImport(ctx: AuthContext, rows: ExcelRow[], sourceFile: string | null) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).previewUnits(rows, sourceFile)
  }

  commitUnitsImport(ctx: AuthContext, preview: UnitsImportPreview) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const result = this.dictFor(ctx).commitUnitsImport(preview)
    rerunChecksForActiveProtocols(this.db)
    return result
  }

  previewFsaImport(
    ctx: AuthContext,
    rows: ExcelRow[],
    catalog: FsaCatalog,
    sourceFile: string | null,
  ) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).previewFsa(rows, catalog, sourceFile)
  }

  commitFsaImport(ctx: AuthContext, preview: FsaImportPreview) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).commitFsaImport(preview)
  }

  createStaff(
    ctx: AuthContext,
    input: Parameters<DictionaryService['createStaff']>[0],
  ) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).createStaff(input)
  }

  updateStaff(
    ctx: AuthContext,
    id: string,
    patch: Parameters<DictionaryService['updateStaff']>[1],
  ) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).updateStaff(id, patch)
  }

  deleteStaff(ctx: AuthContext, id: string): void {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    this.dictFor(ctx).softDeleteStaff(id)
  }

  createOaEdition(
    ctx: AuthContext,
    input: Parameters<DictionaryService['createOaEdition']>[0],
  ) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).createOaEdition(input)
  }

  updateOaEdition(
    ctx: AuthContext,
    id: string,
    patch: Parameters<DictionaryService['updateOaEdition']>[1],
  ) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).updateOaEdition(id, patch)
  }

  deleteOaEdition(ctx: AuthContext, id: string): void {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    this.dictFor(ctx).deactivateOaEdition(id)
  }

  createOaItem(
    ctx: AuthContext,
    input: Parameters<DictionaryService['createOaItem']>[0],
  ) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const item = this.dictFor(ctx).createOaItem(input)
    rerunChecksForActiveProtocols(this.db)
    return item
  }

  updateOaItem(
    ctx: AuthContext,
    id: string,
    patch: Parameters<DictionaryService['updateOaItem']>[1],
  ) {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const item = this.dictFor(ctx).updateOaItem(id, patch)
    rerunChecksForActiveProtocols(this.db)
    return item
  }

  deleteOaItem(ctx: AuthContext, id: string): void {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    this.dictFor(ctx).softDeleteOaItem(id)
    rerunChecksForActiveProtocols(this.db)
  }

  createEquipment(
    ctx: AuthContext,
    input: Parameters<DictionaryService['createEquipment']>[0],
  ): Equipment {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const result = this.dictFor(ctx).createEquipment(input)
    rerunChecksForActiveProtocols(this.db)
    return result
  }

  updateEquipment(
    ctx: AuthContext,
    id: string,
    patch: Parameters<DictionaryService['updateEquipment']>[1],
  ): Equipment {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const result = this.dictFor(ctx).updateEquipment(id, patch)
    rerunChecksForActiveProtocols(this.db)
    return result
  }

  deleteEquipment(ctx: AuthContext, id: string): void {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    this.dictFor(ctx).softDeleteEquipment(id)
    rerunChecksForActiveProtocols(this.db)
  }

  addEquipmentVerification(
    ctx: AuthContext,
    input: Parameters<DictionaryService['addVerification']>[0],
  ): EquipmentVerification {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const result = this.dictFor(ctx).addVerification(input)
    rerunChecksForActiveProtocols(this.db)
    return result
  }

  updateEquipmentVerification(
    ctx: AuthContext,
    id: string,
    patch: Parameters<DictionaryService['updateVerification']>[1],
  ): EquipmentVerification {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const result = this.dictFor(ctx).updateVerification(id, patch)
    rerunChecksForActiveProtocols(this.db)
    return result
  }

  deleteEquipmentVerification(ctx: AuthContext, id: string): void {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    this.dictFor(ctx).softDeleteVerification(id)
    rerunChecksForActiveProtocols(this.db)
  }

  upsertUnit(ctx: AuthContext, unit: Unit): Unit {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const result = this.dictFor(ctx).upsertUnit(unit)
    rerunChecksForActiveProtocols(this.db)
    return result
  }

  deleteUnit(ctx: AuthContext, fgisId: string): void {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    this.dictFor(ctx).deleteUnit(fgisId)
    rerunChecksForActiveProtocols(this.db)
  }

  upsertUnitConversion(ctx: AuthContext, conv: UnitConversion): UnitConversion {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const result = this.dictFor(ctx).upsertUnitConversion(conv)
    rerunChecksForActiveProtocols(this.db)
    return result
  }

  deleteUnitConversion(
    ctx: AuthContext,
    fromSymbol: string,
    toSymbol: string,
  ): void {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    this.dictFor(ctx).deleteUnitConversion(fromSymbol, toSymbol)
    rerunChecksForActiveProtocols(this.db)
  }

  updateProtocolForm(
    ctx: AuthContext,
    formId: string,
    patch: Parameters<DictionaryService['updateProtocolForm']>[1],
  ): ProtocolForm {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    return this.dictFor(ctx).updateProtocolForm(formId, patch)
  }

  upsertFormIndicatorMap(
    ctx: AuthContext,
    input: Parameters<DictionaryService['upsertFormIndicatorMap']>[0],
  ): FormIndicatorMap {
    authorize(ctx, SecuredOperation.dictionaryWrite)
    const map = this.dictFor(ctx).upsertFormIndicatorMap(input)
    for (const p of this.db.protocols) {
      if (p.deletedAt) continue
      if (p.formId !== input.formId) continue
      applyIndicatorMapsToProtocol(this.db, p.id)
    }
    rerunChecksForActiveProtocols(this.db)
    return map
  }

  /** Только для тестовых фикстур. */
  addIssueForTests(issue: ProtocolIssue): void {
    this.db.protocolIssues.push(issue)
  }

  /** Только для тестовых фикстур (stub-протоколы без полного разбора). */
  deactivateIssuesForTests(protocolId: string): void {
    for (const i of this.db.protocolIssues) {
      if (i.protocolId === protocolId) i.isActive = false
    }
  }

  /** Только для тестовых фикстур (backup / concurrency). */
  getDbForTests(): Database {
    return this.db
  }

  locksForTests(): ProtocolLocks {
    return this.locks
  }

  private requireProtocol(id: string): Protocol {
    const protocol = this.db.protocols.find(
      (p) => p.id === id && p.deletedAt === null,
    )
    if (!protocol) notFound('Протокол не найден')
    return protocol
  }

  private replaceProtocol(next: Protocol): void {
    const idx = this.db.protocols.findIndex((p) => p.id === next.id)
    if (idx < 0) notFound('Протокол не найден')
    this.db.protocols[idx] = next
  }

  private audit(
    ctx: AuthContext,
    entity: string,
    entityId: string | null,
    action: string,
    diff: Record<string, unknown> | null,
  ): void {
    this.writeAudit(ctx.staffId, entity, entityId, action, diff)
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

/** Только поля карточки из ТЗ §6.8; даты измерений — только 26-ИДК. */
function sanitizeCardPatch(
  db: Database,
  protocol: Protocol,
  patch: ProtocolEditablePatch,
): CardEditablePatch {
  const form = db.protocolForms.find((f) => f.id === protocol.formId)
  const canEditDates = Boolean(form?.settings?.manualMeasureDates)
  const safe: CardEditablePatch = {}

  if ('applicationDate' in patch) safe.applicationDate = patch.applicationDate
  if ('accredScope353' in patch) safe.accredScope353 = patch.accredScope353
  if ('customerId' in patch) safe.customerId = patch.customerId
  if ('engineerStaffId' in patch) safe.engineerStaffId = patch.engineerStaffId
  if ('measurePlace' in patch) {
    safe.measurePlace = patch.measurePlace?.trim() || null
  }
  if ('measureAddress' in patch) {
    safe.measureAddress = patch.measureAddress?.trim() || null
  }

  if ('measureStart' in patch || 'measureEnd' in patch) {
    if (!canEditDates) {
      throw new DomainError(
        'Даты измерений можно править только для формы 26-ИДК',
        'MEASURE_DATES_LOCKED',
      )
    }
    if ('measureStart' in patch) safe.measureStart = patch.measureStart
    if ('measureEnd' in patch) safe.measureEnd = patch.measureEnd
  }

  return safe
}

export { AppRole } from '@/domain'

