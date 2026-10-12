import { beforeEach, describe, expect, it } from 'vitest'
import {
  CustomerKindId,
  EquipmentKind,
  IssueSeverity,
  OaEditionKind,
  ProtocolStatus,
} from '@/domain'
import type { AuthContext } from '@/security'
import { SeedIds } from '@/data/ids'
import {
  bootstrapServer,
  SeedCredentials,
  type SecureApi,
} from '@/server'
import {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
} from '@/server/db/backup'
import { previewOaImport } from '@/dictionaries/import/oa'
import { previewStaffImport } from '@/dictionaries/import/staff'
import { previewEquipmentImport } from '@/dictionaries/import/equipment'
import { previewUnitsImport } from '@/dictionaries/import/units'
import { parseProtocol } from '@/parser'
import * as XLSX from 'xlsx'
import { minimalPdfBase64 } from '@/fgis-xml/fixtures/minimal-pdf'
import { UPLOAD_CHUNK_SIZE } from '@/shared/upload/chunks'

async function asRole(
  api: SecureApi,
  creds: { email: string; password: string },
): Promise<AuthContext> {
  const login = await api.login(creds.email, creds.password)
  return api.auth.resolveToken(login.token)
}

describe('E2E critical path + edge cases', () => {
  let api: SecureApi
  let head: AuthContext
  let engineer: AuthContext

  beforeEach(async () => {
    ;({ api } = await bootstrapServer())
    head = await asRole(api, SeedCredentials.head)
    engineer = await asRole(api, SeedCredentials.engineer)
  })

  it('полный путь: review → approve → scan+date → ready → xml → sent + audit', () => {
    const protocolId = prepareCleanProtocol(api, head)

    expect(api.approveProtocol(head, protocolId).status).toBe(
      ProtocolStatus.approved,
    )

    const ready = api.attachScanPdf(head, protocolId, {
      fileName: 'scan.pdf',
      contentBase64: minimalPdfBase64('e2e'),
    })
    expect(ready.status).toBe(ProtocolStatus.ready)

    const built = api.buildFgisXml(head, [protocolId])
    expect(built.includedProtocolIds).toEqual([protocolId])
    expect(built.xml).toContain('DataStatusId>20<')
    expect(api.getProtocol(head, protocolId).status).toBe(ProtocolStatus.exported)

    expect(
      api.buildFgisXml(head, [protocolId]).includedProtocolIds,
    ).toContain(protocolId)

    api.markExportUploaded(head, built.exportId)
    expect(api.getProtocol(head, protocolId).status).toBe(ProtocolStatus.sent)

    const labels = api.listAudit(head, { protocolId }).items.map((a) => a.label)
    expect(labels).toEqual(
      expect.arrayContaining([
        'Утвердил',
        'Прикрепил скан',
        'Выгрузил',
        'Включил в выгрузку',
        'Отметил переданным',
      ]),
    )
  })

  it('инженер не может approve / build_xml прямым API', () => {
    const protocolId = prepareCleanProtocol(api, head)
    expect(() => api.approveProtocol(engineer, protocolId)).toThrow()
    expect(() => api.buildFgisXml(engineer, [protocolId])).toThrow()
  })

  it('параллельно: locked protocol блокирует второй approve', () => {
    const protocolId = prepareCleanProtocol(api, head)
    let nestedThrew = false
    api.locksForTests().withLock([protocolId], () => {
      try {
        api.approveProtocol(head, protocolId)
      } catch {
        nestedThrew = true
      }
    })
    expect(nestedThrew).toBe(true)
  })

  it('пустой / повреждённый Excel / неизвестная форма', () => {
    const seed = api.getDictionarySnapshot(head)
    const forms = seed.protocolForms
    const maps = seed.formIndicatorMaps

    const emptyWb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(emptyWb, XLSX.utils.aoa_to_sheet([[]]), 'Пустой')
    const emptyBuf = toAb(XLSX.write(emptyWb, { type: 'array', bookType: 'xlsx' }))
    expect(() =>
      parseProtocol({ data: emptyBuf, forms, indicatorMaps: maps }),
    ).toThrow(/не распознан/i)

    expect(() =>
      parseProtocol({
        data: new TextEncoder().encode('not-an-xlsx').buffer,
        forms,
        indicatorMaps: maps,
      }),
    ).toThrow()

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['Протокол № 1-26-XXX от 01.01.2026']]),
      'НеизвестнаяФорма',
    )
    const buf = toAb(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
    expect(() =>
      parseProtocol({ data: buf, forms, indicatorMaps: maps }),
    ).toThrow(/не распознан/i)
  })

  it('большой PDF принимается через чанковую загрузку без лимита размера', () => {
    const protocolId = api.saveProtocol(head, {
      number: `SCAN-${Date.now()}`,
      protocolDate: '2026-09-22',
      formId: SeedIds.formUhf,
      sourcePath: `protocol-sources/scan-${Date.now()}.xlsx`,
      sourceSha256: `sha-scan-${Date.now()}`,
    }).id
    const big = new Uint8Array(UPLOAD_CHUNK_SIZE + 1200)
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]) // %PDF-
    big.set([0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a], big.length - 7)

    const init = api.initChunkedUpload(head, {
      fileName: 'big.pdf',
      totalBytes: big.byteLength,
      purpose: 'protocol_scan',
    })
    expect(init.totalChunks).toBe(2)
    for (let i = 0; i < init.totalChunks; i++) {
      const begin = i * init.chunkSize
      const end = Math.min(begin + init.chunkSize, big.byteLength)
      const part = big.subarray(begin, end)
      api.putUploadChunk(head, {
        uploadId: init.uploadId,
        chunkIndex: i,
        contentBase64: Buffer.from(part).toString('base64'),
      })
    }
    const attached = api.attachScanPdf(head, protocolId, {
      fileName: 'big.pdf',
      uploadId: init.uploadId,
    })
    expect(attached.scanPath).toBeTruthy()
  })

  it('лимит пакета 100 протоколами', () => {
    expect(() =>
      api.buildFgisXml(
        head,
        Array.from({ length: 101 }, (_, i) => `id-${i}`),
      ),
    ).toThrow(/100/)
  })

  it('импорт объёмов: 278 ОА / 2 редакции / 7 staff / 70 equipment / units', () => {
    const oaRows: Record<string, string>[] = []
    for (let i = 1; i <= 200; i++) {
      oaRows.push({
        пункт: i === 1 ? '1.1.' : `1.${i}.`,
        методика: 'ГОСТ тест',
        показатель: `Показатель ${i}`,
        единица: 'Вт',
        диапазон: '1 - 100',
      })
    }
    oaRows.push({
      пункт: '1.1.',
      методика: 'ГОСТ ext',
      показатель: 'Ext 1',
      единица: 'Вт',
      диапазон: '1 - 10',
    })
    for (let i = 2; i <= 78; i++) {
      oaRows.push({
        пункт: `1.${i}.`,
        методика: 'ГОСТ ext',
        показатель: `Ext ${i}`,
        единица: 'Вт',
        диапазон: '1 - 10',
      })
    }

    const oaPreview = previewOaImport(oaRows, 'oa-278.xlsx')
    expect(oaPreview.canCommit).toBe(true)
    expect(oaPreview.segments.length).toBe(2)
    expect(
      oaPreview.segments[0]!.itemCount + oaPreview.segments[1]!.itemCount,
    ).toBe(278)

    api.commitOaImport(head, oaPreview, [
      OaEditionKind.current,
      OaEditionKind.extension,
    ])
    const afterOa = api.getDictionarySnapshot(head)
    expect(afterOa.oaItems.length).toBeGreaterThanOrEqual(278)
    expect(afterOa.oaEditions.filter((e) => e.isActive).length).toBe(2)

    const staffPrev = previewStaffImport(
      Array.from({ length: 7 }, (_, i) => ({
        Фамилия: `Сотрудник${i + 1}`,
        ФИО: `Сотрудник${i + 1} И.И.`,
        idFullName: String(900000 + i),
        Должность: 'Испытатель',
        Роль: '1',
      })),
    )
    expect(staffPrev.canCommit).toBe(true)
    expect(staffPrev.rows.length).toBe(7)
    api.commitStaffImport(head, staffPrev)

    const eqPrev = previewEquipmentImport(
      Array.from({ length: 70 }, (_, i) => ({
        Наименование: `СИ ${i + 1}`,
        'зав. №': `SN${1000 + i}`,
        EquipmentId: String(200000 + i),
        вид: 'si',
      })),
    )
    expect(eqPrev.canCommit).toBe(true)
    expect(eqPrev.rows.length).toBe(70)
    api.commitEquipmentImport(head, eqPrev)
    expect(api.getDictionarySnapshot(head).equipment.length).toBe(70)

    const uPrev = previewUnitsImport([
      { id: '9991', наименование: 'тест', обозначение: 'тестЕд' },
    ])
    api.commitUnitsImport(head, uPrev)
    expect(
      api.getDictionarySnapshot(head).units.some((u) => u.symbol === 'тестЕд'),
    ).toBe(true)
  })

  it('backup/restore round-trip', async () => {
    const protocolId = prepareCleanProtocol(api, head)
    api.approveProtocol(head, protocolId)
    const snap = exportDatabaseSnapshot(api.getDbForTests())

    const { api: api2 } = await bootstrapServer()
    importDatabaseSnapshot(api2.getDbForTests(), snap)
    const head2 = await asRole(api2, SeedCredentials.head)
    expect(api2.getProtocol(head2, protocolId).status).toBe(
      ProtocolStatus.approved,
    )
  })

  it('не содержит функций из «Не входит»', () => {
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(api))
    for (const name of [
      'sendToFgis',
      'ocrScan',
      'printBlank',
      'assignExecutor',
      'importFrom1c',
      'notifyVerification',
      'generateProtocolPdf',
      'editMeasurements',
    ]) {
      expect(proto).not.toContain(name)
    }
  })
})

function toAb(data: ArrayBuffer | Uint8Array | number[]): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data
  if (ArrayBuffer.isView(data)) {
    const view = data as Uint8Array
    const copy = new Uint8Array(view.byteLength)
    copy.set(view)
    return copy.buffer
  }
  return Uint8Array.from(data as number[]).buffer
}

function prepareCleanProtocol(api: SecureApi, head: AuthContext): string {
  const db = api.getDbForTests()
  const customerId = crypto.randomUUID()
  db.customers.push({
    id: customerId,
    name: 'ООО E2E',
    nameAliases: [],
    kindId: CustomerKindId.legalEntity,
    inn: '7707083893',
    ogrn: '1027700132195',
    phone: '+7',
    email: 'e2e@t.ru',
    legalAddress: 'Москва',
    actualAddress: 'Москва',
    createdAt: new Date().toISOString(),
    deletedAt: null,
  })

  const eqId = crypto.randomUUID()
  db.equipment.push({
    id: eqId,
    name: 'СИ тест',
    serialNo: 'S-1',
    serialNorm: 'S-1',
    invNo: null,
    fgisEquipmentId: 99,
    kind: EquipmentKind.si,
    isActive: true,
    deletedAt: null,
  })
  db.equipmentVerifications.push({
    id: crypto.randomUUID(),
    equipmentId: eqId,
    certNo: 'С-1',
    verifiedOn: '2025-01-01',
    validUntil: '2027-12-31',
    createdAt: new Date().toISOString(),
    deletedAt: null,
  })

  const protocol = api.saveProtocol(head, {
    number: `E2E-${crypto.randomUUID().slice(0, 8)}`,
    protocolDate: '2026-09-22',
    formId: SeedIds.formUhf,
    sourcePath: `x-${crypto.randomUUID()}.xlsx`,
    sourceSha256: crypto.randomUUID().replace(/-/g, '') + 'abcd',
  })

  const idx = db.protocols.findIndex((p) => p.id === protocol.id)
  Object.assign(db.protocols[idx]!, {
    applicationDate: '2026-09-10',
    measureStart: '2026-09-20',
    measureEnd: '2026-09-21',
    customerId,
    objectFullName: 'Объект',
    measureAddress: 'Адрес',
    engineerStaffId: SeedIds.staffSudnitsyn,
  })

  const objectId = crypto.randomUUID()
  db.protocolObjects.push({
    id: objectId,
    protocolId: protocol.id,
    seq: 1,
    name: 'Объект',
    serialNo: '1',
    year: '2020',
    department: null,
  })
  db.protocolResults.push({
    id: crypto.randomUUID(),
    protocolId: protocol.id,
    objectId,
    seq: 1,
    sourceKey: 'выходная мощность, вт',
    indicatorRaw: 'Выходная мощность',
    unitSymbol: 'Вт',
    setValue: null,
    rawValues: [60, 62, 64, 66],
    avgExcel: 63,
    uExcel: 5,
    avgCalc: 63,
    uCalc: 5,
    numberFormat: '0.0',
    displayExcel: 63,
    factValue: '63,0',
    oaItemId: SeedIds.oaItemUhfPower,
    includeInXml: true,
  })
  db.protocolEquipment.push({
    protocolId: protocol.id,
    seq: 1,
    equipmentId: eqId,
    rawText: 'СИ тест',
    serialRaw: 'S-1',
    certRaw: 'С-1',
    validUntilRaw: '2027-12-31',
    kind: EquipmentKind.si,
  })

  api.deactivateIssuesForTests(protocol.id)
  api.runProtocolChecks(head, protocol.id)
  for (const i of db.protocolIssues.filter(
    (x) => x.protocolId === protocol.id && x.isActive,
  )) {
    if (i.severity === IssueSeverity.warning) {
      api.acknowledgeIssue(head, i.id, 'ok')
    } else {
      i.isActive = false
    }
  }
  return protocol.id
}
