import type { ProtocolEditablePatch } from '@/domain'
import type { ProtocolCardDetail } from '@/server/protocol/card-types'
import { apiFetchBlob, apiFetchJson } from '@/client/dictionaries-api'

export type { ProtocolCardDetail }

export async function fetchProtocolDetail(
  protocolId: string,
): Promise<ProtocolCardDetail> {
  return apiFetchJson<ProtocolCardDetail>(`/protocols/${protocolId}/detail`)
}

export async function updateProtocolCard(
  protocolId: string,
  patch: ProtocolEditablePatch,
): Promise<ProtocolCardDetail['protocol']> {
  return apiFetchJson(`/rpc/protocol_update`, {
    method: 'POST',
    body: JSON.stringify({ protocolId, patch }),
  })
}

export async function approveProtocolCard(protocolId: string) {
  return apiFetchJson(`/rpc/protocol_approve`, {
    method: 'POST',
    body: JSON.stringify({ protocolId }),
  })
}

export async function returnProtocolCard(protocolId: string, reason: string) {
  return apiFetchJson(`/rpc/protocol_return`, {
    method: 'POST',
    body: JSON.stringify({ protocolId, reason }),
  })
}

export async function deleteProtocolCard(protocolId: string) {
  return apiFetchJson<{ ok: boolean }>(`/rpc/protocol_delete`, {
    method: 'POST',
    body: JSON.stringify({ protocolId }),
  })
}

export async function acknowledgeIssueCard(issueId: string, comment: string) {
  return apiFetchJson(`/rpc/issue_acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ issueId, comment }),
  })
}

export async function attachScanPdf(
  protocolId: string,
  input: { fileName: string; uploadId?: string; contentBase64?: string },
) {
  return apiFetchJson(`/rpc/protocol_attach_scan`, {
    method: 'POST',
    body: JSON.stringify({
      protocolId,
      fileName: input.fileName,
      uploadId: input.uploadId ?? null,
      contentBase64: input.contentBase64 ?? null,
    }),
  })
}

export async function detachScanPdf(protocolId: string) {
  return apiFetchJson(`/rpc/protocol_detach_scan`, {
    method: 'POST',
    body: JSON.stringify({ protocolId }),
  })
}

export async function fetchScanPdfBlob(protocolId: string): Promise<Blob> {
  return apiFetchBlob(`/protocols/${protocolId}/scan`)
}

export async function setResultOa(resultId: string, oaItemId: string) {
  return apiFetchJson<ProtocolCardDetail>(`/rpc/result_set_oa`, {
    method: 'POST',
    body: JSON.stringify({ resultId, oaItemId }),
  })
}

export async function setResultInclude(
  resultId: string,
  includeInXml: boolean,
  comment: string,
) {
  return apiFetchJson<ProtocolCardDetail>(`/rpc/result_set_include`, {
    method: 'POST',
    body: JSON.stringify({ resultId, includeInXml, comment }),
  })
}

export async function setProtocolEquipment(
  protocolId: string,
  seq: number,
  equipmentId: string | null,
) {
  return apiFetchJson<ProtocolCardDetail>(`/rpc/protocol_set_equipment`, {
    method: 'POST',
    body: JSON.stringify({ protocolId, seq, equipmentId }),
  })
}

