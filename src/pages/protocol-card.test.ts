import { describe, expect, it } from 'vitest'
import {
  CustomerKindId,
  EquipmentKind,
  IssueSeverity,
  ProtocolStatus,
} from '@/domain'
import type { AuthContext } from '@/security'
import { SeedIds } from '@/data/ids'
import { bootstrapServer, SeedCredentials, type SecureApi } from '@/server'

describe('Protocol card workflow', () => {
  it('правка approved → review; approve блокируется ошибками и непринятыми warning', async () => {
    const { api } = await bootstrapServer()
    const head = await asHead(api)
    const protocolId = seedProtocol(api, head)

    api.deactivateIssuesForTests(protocolId)
    const approved = api.approveProtocol(head, protocolId)
    expect(approved.status).toBe(ProtocolStatus.approved)

    const afterEdit = api.updateProtocol(head, protocolId, {
      applicationDate: '2026-09-11',
    })
    expect(afterEdit.status).toBe(ProtocolStatus.review)
    expect(afterEdit.approvedBy).toBeNull()

    api.addIssueForTests({
      id: crypto.randomUUID(),
      protocolId,
      code: 'E03',
      severity: IssueSeverity.error,
      message: 'test error',
      ref: null,
      acknowledgedBy: null,
      acknowledgedAt: null,
      ackComment: null,
      isActive: true,
      createdAt: new Date().toISOString(),
    })
    expect(() => api.approveProtocol(head, protocolId)).toThrow(/ошибк/i)

    api.deactivateIssuesForTests(protocolId)
    const warnId = crypto.randomUUID()
    api.addIssueForTests({
      id: warnId,
      protocolId,
      code: 'W02',
      severity: IssueSeverity.warning,
      message: 'test warn',
      ref: null,
      acknowledgedBy: null,
      acknowledgedAt: null,
      ackComment: null,
      isActive: true,
      createdAt: new Date().toISOString(),
    })
    expect(() => api.approveProtocol(head, protocolId)).toThrow(/замечан/i)

    // комментарий необязателен (ТЗ §9)
    const acked = api.acknowledgeIssue(head, warnId, null)
    expect(acked.acknowledgedBy).toBe(head.staffId)
    expect(acked.ackComment).toBeNull()

    const ok = api.approveProtocol(head, protocolId)
    expect(ok.status).toBe(ProtocolStatus.approved)
  })

  it('возврат требует причину; PDF → ready при approved + дате заявки', async () => {
    const { api } = await bootstrapServer()
    const head = await asHead(api)
    const protocolId = seedProtocol(api, head)
    api.deactivateIssuesForTests(protocolId)

    api.approveProtocol(head, protocolId)
    expect(() => api.returnProtocol(head, protocolId, '  ')).toThrow(/причин/i)

    const returned = api.returnProtocol(head, protocolId, 'Нужна правка')
    expect(returned.status).toBe(ProtocolStatus.review)

    api.deactivateIssuesForTests(protocolId)
    api.approveProtocol(head, protocolId)

    const pdf = '%PDF-1.4 fake content for test'
    const ready = api.attachScanPdf(head, protocolId, {
      fileName: 'scan.pdf',
      contentBase64: btoa(pdf),
    })
    expect(ready.status).toBe(ProtocolStatus.ready)
    expect(ready.scanPath).toMatch(/^protocol-scans\//)

    expect(() =>
      api.attachScanPdf(head, protocolId, {
        fileName: 'scan.png',
        contentBase64: btoa(pdf),
      }),
    ).toThrow(/PDF/i)

    const detail = api.getProtocolDetail(head, protocolId)
    expect(detail.scan.fileName).toBe('scan.pdf')
    expect(detail.results.length).toBe(1)
    expect(detail.xmlPreview).toContain('FactValue')
    expect(detail.approval.canApprove).toBe(false)
  })

  it('include_in_xml требует комментарий; даты измерений только для ИДК', async () => {
    const { api } = await bootstrapServer()
    const head = await asHead(api)
    const protocolId = seedProtocol(api, head)
    const result = dbOf(api).protocolResults.find(
      (r) => r.protocolId === protocolId,
    )!

    expect(() => api.setResultInclude(head, result.id, false, '')).toThrow(
      /комментар/i,
    )

    const next = api.setResultInclude(head, result.id, false, 'исключить строку')
    expect(next.results.find((r) => r.id === result.id)?.includeInXml).toBe(
      false,
    )

    expect(() =>
      api.updateProtocol(head, protocolId, { measureStart: '2026-01-01' }),
    ).toThrow(/26-ИДК/i)
  })
})

async function asHead(api: SecureApi) {
  const login = await api.login(
    SeedCredentials.head.email,
    SeedCredentials.head.password,
  )
  return api.auth.resolveToken(login.token)
}

function dbOf(api: SecureApi) {
  return (api as unknown as { db: import('@/server/db/database').Database }).db
}

function seedProtocol(api: SecureApi, head: AuthContext): string {
  const db = dbOf(api)
  const customerId = crypto.randomUUID()
  db.customers.push({
    id: customerId,
    name: 'ООО Workflow',
    nameAliases: [],
    kindId: CustomerKindId.legalEntity,
    inn: '7707083893',
    ogrn: '1027700132195',
    phone: '+7',
    email: 'w@t.ru',
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
    number: `WF-${crypto.randomUUID().slice(0, 8)}`,
    protocolDate: '2026-09-22',
    formId: SeedIds.formUhf,
    sourcePath: 'x.xlsx',
    sourceSha256: 'b'.repeat(64),
  })

  // заполняем обязательные поля для карточки / approve
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

  return protocol.id
}
