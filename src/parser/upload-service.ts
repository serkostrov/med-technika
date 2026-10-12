import {
  ProtocolStatus,
  softDelete,
  type Protocol,
  type ProtocolEquipment,
  type ProtocolObject,
  type ProtocolResult,
} from '@/domain'
import { DomainError } from '@/domain'
import { parseProtocol, type ParsedProtocol } from '@/parser'
import { sha256Hex } from '@/parser/hash'
import type { Database } from '@/server/db/database'
import type { AuthContext } from '@/security'
import { authorize, SecuredOperation } from '@/security'
import { DictionaryService } from '@/dictionaries'
import {
  matchCustomerByName,
  matchEngineer,
  matchEquipment,
  protocolRunChecks,
} from '@/validation'

export type StoredSource = {
  path: string
  sha256: string
  fileName: string
  bytes: ArrayBuffer
  uploadedAt: string
}

export type ParseUploadResult = {
  sha256: string
  sourcePath: string
  alreadyUploaded: { protocolId: string; number: string } | null
  replaceCandidate: { protocolId: string; number: string; status: string } | null
  parsed: ParsedProtocol | null
  error: string | null
  progress: { stage: string; message: string }[]
  matching: {
    customerId: string | null
    customerName: string | null
    engineerStaffId: string | null
    unmatchedResults: string[]
    unmatchedEquipment: string[]
  } | null
}

/**
 * Сервис загрузки/разбора протоколов.
 * Excel — источник истины; измерения не редактируются здесь.
 */
export class ProtocolUploadService {
  private readonly db: Database
  private readonly sources: Map<string, StoredSource>
  private readonly audit: (
    actor: string,
    entity: string,
    entityId: string | null,
    action: string,
    diff: Record<string, unknown> | null,
  ) => void

  constructor(
    db: Database,
    sources: Map<string, StoredSource>,
    audit: (
      actor: string,
      entity: string,
      entityId: string | null,
      action: string,
      diff: Record<string, unknown> | null,
    ) => void,
  ) {
    this.db = db
    this.sources = sources
    this.audit = audit
  }

  async parseUpload(
    ctx: AuthContext,
    fileName: string,
    data: ArrayBuffer,
    preferredSheetName?: string | null,
  ): Promise<ParseUploadResult> {
    authorize(ctx, SecuredOperation.protocolSave)
    const progress: ParseUploadResult['progress'] = []
    const sha256 = await sha256Hex(data)

    const existingByHash = this.db.protocols.find(
      (p) => p.deletedAt === null && p.sourceSha256 === sha256,
    )
    if (existingByHash) {
      return {
        sha256,
        sourcePath: existingByHash.sourcePath,
        alreadyUploaded: {
          protocolId: existingByHash.id,
          number: existingByHash.number,
        },
        replaceCandidate: null,
        parsed: null,
        error: 'Этот файл уже загружен',
        progress: [
          {
            stage: 'dedup',
            message: `Этот файл уже загружен: ${existingByHash.number}`,
          },
        ],
        matching: null,
      }
    }

    const sourcePath = `protocol-sources/${sha256}.xlsx`
    this.sources.set(sourcePath, {
      path: sourcePath,
      sha256,
      fileName,
      bytes: data.slice(0),
      uploadedAt: new Date().toISOString(),
    })

    try {
      const parsed = parseProtocol({
        data,
        forms: this.db.protocolForms,
        indicatorMaps: this.db.formIndicatorMaps,
        recalcTolerance: Number(
          this.db.settings.find((s) => s.key === 'recalc_tolerance')?.value ??
            1e-6,
        ),
        preferredSheetName,
        onProgress: (e) => progress.push(e),
      })

      const replaceCandidate = this.db.protocols.find(
        (p) =>
          p.deletedAt === null &&
          p.number === parsed.metadata.number &&
          p.protocolDate === parsed.metadata.protocolDate,
      )

      if (
        replaceCandidate &&
        (replaceCandidate.status === ProtocolStatus.exported ||
          replaceCandidate.status === ProtocolStatus.sent)
      ) {
        return {
          sha256,
          sourcePath,
          alreadyUploaded: null,
          replaceCandidate: {
            protocolId: replaceCandidate.id,
            number: replaceCandidate.number,
            status: replaceCandidate.status,
          },
          parsed: null,
          error:
            'Повтор номера и даты после выгрузки запрещён (ФЛК 5). Замена невозможна.',
          progress,
          matching: null,
        }
      }

      return {
        sha256,
        sourcePath,
        alreadyUploaded: null,
        replaceCandidate: replaceCandidate
          ? {
              protocolId: replaceCandidate.id,
              number: replaceCandidate.number,
              status: replaceCandidate.status,
            }
          : null,
        parsed,
        error: null,
        progress,
        matching: this.buildMatchingHints(parsed),
      }
    } catch (err) {
      // исходник сохранён, но протокол не создаём
      const message =
        err instanceof Error ? err.message : 'Файл не распознан: неизвестная ошибка'
      progress.push({ stage: 'error', message })
      return {
        sha256,
        sourcePath,
        alreadyUploaded: null,
        replaceCandidate: null,
        parsed: null,
        error: message,
        progress,
        matching: null,
      }
    }
  }

  saveParsed(
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
    authorize(ctx, SecuredOperation.protocolSave)
    const source = this.sources.get(input.sourcePath)
    if (!source || source.sha256 !== input.sha256) {
      throw new DomainError('Исходный файл не найден в хранилище', 'SOURCE_MISSING')
    }

    if (input.replaceProtocolId) {
      const old = this.db.protocols.find((p) => p.id === input.replaceProtocolId)
      if (!old || old.deletedAt) {
        throw new DomainError('Заменяемый протокол не найден', 'NOT_FOUND')
      }
      if (
        old.status === ProtocolStatus.exported ||
        old.status === ProtocolStatus.sent
      ) {
        throw new DomainError(
          'Замена запрещена после выгрузки (ФЛК 5)',
          'REPLACE_FORBIDDEN',
        )
      }
      Object.assign(old, softDelete(old))
      this.audit(ctx.staffId, 'protocols', old.id, 'replace_soft_delete', null)
    }

    const dict = new DictionaryService(this.db, (entity, entityId, action, diff) => {
      this.audit(ctx.staffId, entity, entityId, action, diff)
    })

    let customerId = input.customerId ?? null
    if (!customerId && input.createCustomer && input.parsed.metadata.customerName) {
      const created = dict.upsertCustomer({
        name: input.parsed.metadata.customerName,
        phone: input.parsed.metadata.customerPhone,
        legalAddress: input.parsed.metadata.customerLegalAddress,
        actualAddress: input.parsed.metadata.customerActualAddress,
      })
      customerId = created.id
    }
    if (!customerId && input.parsed.metadata.customerName) {
      customerId =
        dict.findCustomerByName(input.parsed.metadata.customerName)?.id ?? null
    }

    const engineerStaffId =
      matchEngineer(this.db.staff, input.parsed.metadata.engineerShortName)
        ?.id ?? null

    const protocol: Protocol = {
      id: crypto.randomUUID(),
      number: input.parsed.metadata.number,
      protocolDate: input.parsed.metadata.protocolDate,
      measureStart: input.parsed.metadata.measureStart,
      measureEnd: input.parsed.metadata.measureEnd,
      modelGetDate: input.parsed.metadata.measureStart,
      applicationDate: null,
      formId: input.parsed.formId,
      customerId,
      raw: input.parsed as unknown as Record<string, unknown>,
      objectFullName: input.parsed.metadata.objectFullName,
      measurePlace: input.parsed.metadata.measurePlace,
      measureAddress: input.parsed.metadata.measureAddress,
      territoryFeature: null,
      customerPhone: input.parsed.metadata.customerPhone,
      conditions: input.parsed.metadata.conditions,
      engineerStaffId,
      accredScope353: false,
      status: ProtocolStatus.review,
      sourcePath: input.sourcePath,
      sourceSha256: input.sha256,
      parserVersion: `${input.parsed.parserVersion}/${input.parsed.profileVersion}`,
      scanPath: null,
      uploadedBy: ctx.staffId,
      uploadedAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
      deletedAt: null,
    }
    this.db.protocols.push(protocol)

    const objectIdBySeq = new Map<number, string>()
    for (const obj of input.parsed.objects) {
      const row: ProtocolObject = {
        id: crypto.randomUUID(),
        protocolId: protocol.id,
        seq: obj.seq,
        name: obj.name,
        serialNo: obj.serialNo,
        year: obj.year,
        department: obj.department,
      }
      this.db.protocolObjects.push(row)
      objectIdBySeq.set(obj.seq, row.id)
    }

    for (const res of input.parsed.results) {
      const map = this.db.formIndicatorMaps.find(
        (m) =>
          m.formId === input.parsed.formId && m.sourceKey === res.sourceKey,
      )
      const row: ProtocolResult = {
        id: crypto.randomUUID(),
        protocolId: protocol.id,
        objectId:
          res.objectSeq != null ? objectIdBySeq.get(res.objectSeq) ?? null : null,
        seq: res.seq,
        sourceKey: res.sourceKey,
        indicatorRaw: res.indicatorRaw,
        unitSymbol: res.unitSymbol,
        setValue: res.setValue,
        rawValues: res.rawValues,
        avgExcel: res.avgExcel,
        uExcel: res.uExcel,
        avgCalc: res.avgCalc,
        uCalc: res.uCalc,
        numberFormat: res.numberFormat,
        displayExcel: res.displayValue,
        factValue: res.factValue,
        oaItemId: map?.oaItemId ?? null,
        includeInXml: true,
      }
      this.db.protocolResults.push(row)
    }

    for (const eq of input.parsed.equipment) {
      const matched = this.matchEquipment(eq.serialRaw, eq.name)
      const row: ProtocolEquipment = {
        protocolId: protocol.id,
        seq: eq.seq,
        equipmentId: matched,
        rawText: eq.rawText,
        serialRaw: eq.serialRaw,
        certRaw: eq.certRaw,
        validUntilRaw: eq.validUntilRaw,
        kind: eq.kind,
      }
      this.db.protocolEquipment.push(row)
    }

    protocolRunChecks(this.db, protocol.id)
    this.audit(ctx.staffId, 'protocols', protocol.id, 'upload_save', {
      number: protocol.number,
      sha256: input.sha256,
    })
    return { ...protocol }
  }

  private buildMatchingHints(parsed: ParsedProtocol) {
    const customer = matchCustomerByName(
      this.db.customers,
      parsed.metadata.customerName,
    )
    const unmatchedResults = parsed.results
      .filter(
        (r) =>
          !this.db.formIndicatorMaps.some(
            (m) => m.formId === parsed.formId && m.sourceKey === r.sourceKey,
          ),
      )
      .map((r) => r.sourceKey)
    const unmatchedEquipment = parsed.equipment
      .filter(
        (e) =>
          !matchEquipment(this.db.equipment, e.serialRaw, e.name),
      )
      .map((e) => e.rawText)

    return {
      customerId: customer?.id ?? null,
      customerName: parsed.metadata.customerName,
      engineerStaffId:
        matchEngineer(this.db.staff, parsed.metadata.engineerShortName)?.id ??
        null,
      unmatchedResults,
      unmatchedEquipment,
    }
  }

  private matchEquipment(
    serialRaw: string | null,
    name: string | null,
  ): string | null {
    return matchEquipment(this.db.equipment, serialRaw, name)?.id ?? null
  }
}
