import { describe, expect, it } from 'vitest'
import {
  AppRole,
  DomainError,
  IssueSeverity,
  ProtocolStatus,
  assertNoStatusInPatch,
  approveProtocol,
  canApprove,
  markExported,
  markSent,
  returnToReview,
  type Protocol,
  type ProtocolIssue,
} from '@/domain'
import {
  applyProtocolUpdate,
  applySoftDelete,
  rejectClientStatusMutation,
} from '@/application/protocol-commands'
import { SeedIds } from '@/data/ids'

function baseProtocol(status: ProtocolStatus = ProtocolStatus.review): Protocol {
  return {
    id: 'p1',
    number: '20-26-УВЧ',
    protocolDate: '2026-09-22',
    measureStart: '2026-09-18',
    measureEnd: '2026-09-18',
    modelGetDate: null,
    applicationDate: '2026-09-10',
    formId: SeedIds.formUhf,
    customerId: null,
    raw: {},
    objectFullName: 'Медицинские аппараты',
    measurePlace: null,
    measureAddress: null,
    territoryFeature: null,
    customerPhone: null,
    conditions: null,
    engineerStaffId: SeedIds.staffSudnitsyn,
    accredScope353: false,
    status,
    sourcePath: 'protocol-sources/a.xlsx',
    sourceSha256: 'abc',
    parserVersion: '1',
    scanPath: null,
    uploadedBy: SeedIds.staffSudnitsyn,
    uploadedAt: '2026-10-05T10:00:00.000Z',
    approvedBy: null,
    approvedAt: null,
    deletedAt: null,
  }
}

const head = { staffId: SeedIds.staffSadakov, isHead: true }
const engineer = { staffId: SeedIds.staffSudnitsyn, isHead: false }

describe('ProtocolLifecycle', () => {
  it('блокирует утверждение при активной ошибке', () => {
    const protocol = baseProtocol()
    const issues: ProtocolIssue[] = [
      {
        id: 'i1',
        protocolId: protocol.id,
        code: 'E03',
        severity: IssueSeverity.error,
        message: 'Нет ОА',
        ref: null,
        acknowledgedBy: null,
        acknowledgedAt: null,
        ackComment: null,
        isActive: true,
        createdAt: '2026-10-05T10:00:00.000Z',
      },
    ]
    expect(canApprove(protocol, issues).ok).toBe(false)
    expect(() => approveProtocol(protocol, issues, head)).toThrow(DomainError)
  })

  it('утверждает при принятых замечаниях; инженер не может', () => {
    const protocol = baseProtocol()
    const issues: ProtocolIssue[] = [
      {
        id: 'i2',
        protocolId: protocol.id,
        code: 'W02',
        severity: IssueSeverity.warning,
        message: 'Расхождение',
        ref: null,
        acknowledgedBy: SeedIds.staffSadakov,
        acknowledgedAt: '2026-10-05T11:00:00.000Z',
        ackComment: null,
        isActive: true,
        createdAt: '2026-10-05T10:00:00.000Z',
      },
    ]
    expect(() => approveProtocol(protocol, issues, engineer)).toThrow(/начальник/i)
    const approved = approveProtocol(protocol, issues, head)
    expect(approved.status).toBe(ProtocolStatus.approved)
    expect(approved.approvedBy).toBe(SeedIds.staffSadakov)
  })

  it('правка в approved возвращает в review', () => {
    const approved = {
      ...baseProtocol(ProtocolStatus.approved),
      approvedBy: SeedIds.staffSadakov,
      approvedAt: '2026-10-05T12:00:00.000Z',
    }
    const next = applyProtocolUpdate(approved, { applicationDate: '2026-09-11' })
    expect(next.status).toBe(ProtocolStatus.review)
    expect(next.approvedBy).toBeNull()
    expect(next.applicationDate).toBe('2026-09-11')
  })

  it('запрещает прямое изменение status из клиентского patch', () => {
    expect(() => assertNoStatusInPatch({ status: 'approved' })).toThrow(
      /запрещено/i,
    )
    expect(() =>
      rejectClientStatusMutation({ status: ProtocolStatus.ready }),
    ).toThrow(DomainError)
  })

  it('проходит exported → sent; удаление после exported запрещено', () => {
    const ready = {
      ...baseProtocol(ProtocolStatus.ready),
      scanPath: 'scans/a.pdf',
    }
    const exported = markExported(ready)
    expect(exported.status).toBe(ProtocolStatus.exported)
    expect(markSent(exported).status).toBe(ProtocolStatus.sent)
    expect(() => applySoftDelete(exported)).toThrow(/Удаление запрещено/)
    expect(applySoftDelete(baseProtocol()).deletedAt).not.toBeNull()
  })

  it('returnToReview только для head с причиной', () => {
    const approved = baseProtocol(ProtocolStatus.approved)
    expect(() => returnToReview(approved, engineer, 'ошибка')).toThrow(
      /начальник/i,
    )
    expect(() => returnToReview(approved, head, '  ')).toThrow(/причин/i)
    const back = returnToReview(approved, head, 'Нужна правка скана')
    expect(back.status).toBe(ProtocolStatus.review)
  })

  it('AppRole содержит только head и engineer', () => {
    expect(Object.values(AppRole).sort()).toEqual(['engineer', 'head'])
  })
})
