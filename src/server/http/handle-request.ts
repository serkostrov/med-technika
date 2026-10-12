import { SecurityError, type AuthContext } from '@/security'
import type { SecureApi } from '@/server/rpc/secure-api'
import { DomainError } from '@/domain'
import { parseProtocolListQuery } from '@/server/protocol/list-query'
import { parseAuditListQuery } from '@/server/protocol/audit-query'

type Json = unknown

/**
 * HTTP-фасад над SecureApi.
 * Прямой вызов с Bearer-токеном — единственный способ доступа к данным.
 */
export async function handleApiRequest(
  api: SecureApi,
  request: Request,
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const method = request.method.toUpperCase()

    if (method === 'POST' && path === '/auth/login') {
      const body = await readJson(request)
      const result = await api.login(
        String(body.email ?? ''),
        String(body.password ?? ''),
      )
      return json(200, result)
    }

    if (method === 'POST' && path === '/auth/register') {
      api.selfRegister()
    }

    const ctx = resolveAuth(api, request)

    if (method === 'GET' && path === '/auth/me') {
      return json(200, { staffId: ctx.staffId, role: ctx.role, email: ctx.email })
    }

    if (method === 'GET' && path === '/protocols') {
      const q = parseProtocolListQuery(url.searchParams)
      return json(200, api.listProtocols(ctx, q))
    }

    if (method === 'GET' && path === '/audit') {
      const q = parseAuditListQuery(url.searchParams)
      return json(200, api.listAudit(ctx, q))
    }

    if (method === 'GET' && path.startsWith('/protocols/')) {
      const rest = path.slice('/protocols/'.length)
      if (rest.endsWith('/detail')) {
        const id = rest.slice(0, -'/detail'.length)
        return json(200, api.getProtocolDetail(ctx, id))
      }
      if (rest.endsWith('/scan')) {
        const id = rest.slice(0, -'/scan'.length)
        const file = api.getScanPdf(ctx, id)
        return new Response(file.bytes, {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
          },
        })
      }
      return json(200, api.getProtocol(ctx, rest))
    }

    if (method === 'POST' && path === '/rpc/protocol_save') {
      const body = await readJson(request)
      return json(200, api.saveProtocol(ctx, body as Parameters<SecureApi['saveProtocol']>[1]))
    }

    if (method === 'POST' && path === '/rpc/upload_init') {
      const body = await readJson(request)
      return json(
        200,
        api.initChunkedUpload(ctx, {
          fileName: String(body.fileName ?? ''),
          totalBytes: Number(body.totalBytes),
          purpose: body.purpose as 'protocol_source' | 'protocol_scan',
        }),
      )
    }

    if (method === 'POST' && path === '/rpc/upload_chunk') {
      const body = await readJson(request)
      return json(
        200,
        api.putUploadChunk(ctx, {
          uploadId: String(body.uploadId),
          chunkIndex: Number(body.chunkIndex),
          contentBase64: String(body.contentBase64 ?? ''),
        }),
      )
    }

    if (method === 'POST' && path === '/rpc/upload_abort') {
      const body = await readJson(request)
      api.abortChunkedUpload(ctx, String(body.uploadId))
      return json(200, { ok: true })
    }

    if (method === 'POST' && path === '/rpc/parse_protocol') {
      const body = await readJson(request)
      return json(
        200,
        await api.parseProtocolUpload(ctx, {
          fileName: body.fileName != null ? String(body.fileName) : undefined,
          contentBase64:
            body.contentBase64 != null ? String(body.contentBase64) : null,
          uploadId: body.uploadId != null ? String(body.uploadId) : null,
          preferredSheetName: (body.preferredSheetName as string) ?? null,
        }),
      )
    }

    if (method === 'POST' && path === '/rpc/protocol_save_parsed') {
      const body = await readJson(request)
      return json(
        200,
        api.saveParsedProtocol(ctx, {
          sourcePath: String(body.sourcePath),
          sha256: String(body.sha256),
          parsed: body.parsed as never,
          replaceProtocolId: (body.replaceProtocolId as string) ?? null,
          customerId: (body.customerId as string) ?? null,
          createCustomer: Boolean(body.createCustomer),
        }),
      )
    }

    if (method === 'POST' && path === '/rpc/protocol_update') {
      const body = await readJson(request)
      return json(
        200,
        api.updateProtocol(ctx, String(body.protocolId), body.patch ?? body),
      )
    }

    if (method === 'POST' && path === '/rpc/protocol_run_checks') {
      const body = await readJson(request)
      return json(200, api.runProtocolChecks(ctx, String(body.protocolId)))
    }

    if (method === 'POST' && path === '/rpc/protocol_set_status') {
      const body = await readJson(request)
      api.directSetStatus(ctx, String(body.protocolId), String(body.status))
    }

    if (method === 'POST' && path === '/rpc/protocol_approve') {
      const body = await readJson(request)
      return json(200, api.approveProtocol(ctx, String(body.protocolId)))
    }

    if (method === 'POST' && path === '/rpc/protocol_return') {
      const body = await readJson(request)
      return json(
        200,
        api.returnProtocol(ctx, String(body.protocolId), String(body.reason ?? '')),
      )
    }

    if (method === 'POST' && path === '/rpc/protocol_attach_scan') {
      const body = await readJson(request)
      return json(
        200,
        api.attachScanPdf(ctx, String(body.protocolId), {
          fileName: body.fileName != null ? String(body.fileName) : undefined,
          contentBase64:
            body.contentBase64 != null ? String(body.contentBase64) : null,
          uploadId: body.uploadId != null ? String(body.uploadId) : null,
        }),
      )
    }

    if (method === 'POST' && path === '/rpc/protocol_detach_scan') {
      const body = await readJson(request)
      return json(200, api.detachScanPdf(ctx, String(body.protocolId)))
    }

    if (method === 'POST' && path === '/rpc/issue_acknowledge') {
      const body = await readJson(request)
      return json(
        200,
        api.acknowledgeIssue(
          ctx,
          String(body.issueId),
          body.comment != null ? String(body.comment) : null,
        ),
      )
    }

    if (method === 'POST' && path === '/rpc/result_set_oa') {
      const body = await readJson(request)
      return json(
        200,
        api.setResultOa(ctx, String(body.resultId), String(body.oaItemId)),
      )
    }

    if (method === 'POST' && path === '/rpc/result_set_include') {
      const body = await readJson(request)
      return json(
        200,
        api.setResultInclude(
          ctx,
          String(body.resultId),
          Boolean(body.includeInXml),
          String(body.comment ?? ''),
        ),
      )
    }

    if (method === 'POST' && path === '/rpc/protocol_set_equipment') {
      const body = await readJson(request)
      return json(
        200,
        api.setProtocolEquipment(
          ctx,
          String(body.protocolId),
          Number(body.seq),
          body.equipmentId == null ? null : String(body.equipmentId),
        ),
      )
    }

    if (method === 'POST' && path === '/rpc/protocol_delete') {
      const body = await readJson(request)
      api.deleteProtocol(ctx, String(body.protocolId))
      return json(200, { ok: true })
    }

    if (method === 'POST' && path === '/rpc/build_fgis_xml') {
      const body = await readJson(request)
      return json(200, api.buildFgisXml(ctx, (body.protocolIds as string[]) ?? []))
    }

    if (method === 'GET' && path === '/fgis-exports') {
      return json(200, api.listFgisExports(ctx))
    }

    if (method === 'GET' && path.startsWith('/fgis-exports/')) {
      const id = path.slice('/fgis-exports/'.length)
      return json(200, api.getFgisExport(ctx, id))
    }

    if (method === 'POST' && path === '/rpc/export_mark_uploaded') {
      const body = await readJson(request)
      api.markExportUploaded(ctx, String(body.exportId))
      return json(200, { ok: true })
    }

    if (method === 'POST' && path === '/users') {
      const body = await readJson(request)
      return json(
        200,
        await api.createUser(ctx, {
          email: String(body.email),
          password: String(body.password),
          staffId: String(body.staffId),
        }),
      )
    }

    if (method === 'PUT' && path === '/users/password') {
      const body = await readJson(request)
      return json(
        200,
        await api.setUserPassword(ctx, {
          staffId: String(body.staffId),
          password: String(body.password),
        }),
      )
    }

    if (method === 'GET' && path === '/users') {
      return json(200, api.listUsers(ctx))
    }

    if (method === 'GET' && path === '/settings') {
      return json(200, api.getSettings(ctx))
    }

    if (method === 'PUT' && path === '/settings') {
      const body = await readJson(request)
      return json(200, api.writeSetting(ctx, String(body.key), body.value))
    }

    if (method === 'POST' && path === '/customers') {
      const body = await readJson(request)
      return json(200, api.createCustomer(ctx, body as never))
    }

    if (
      (method === 'PATCH' || method === 'PUT') &&
      path.startsWith('/customers/')
    ) {
      const id = path.slice('/customers/'.length)
      const body = await readJson(request)
      return json(200, api.updateCustomer(ctx, id, body))
    }

    if (method === 'DELETE' && path.startsWith('/customers/')) {
      const id = path.slice('/customers/'.length)
      api.deleteCustomer(ctx, id)
      return json(200, { ok: true })
    }

    if (method === 'GET' && path === '/staff') {
      return json(200, api.listStaff(ctx))
    }

    if (method === 'GET' && path === '/dictionaries') {
      return json(200, api.getDictionarySnapshot(ctx))
    }

    if (method === 'POST' && path === '/rpc/oa_import_preview') {
      const body = await readJson(request)
      return json(
        200,
        api.previewOaImport(
          ctx,
          (body.rows as never[]) ?? [],
          (body.sourceFile as string) ?? null,
        ),
      )
    }

    if (method === 'POST' && path === '/rpc/oa_import') {
      const body = await readJson(request)
      return json(
        200,
        api.commitOaImport(
          ctx,
          body.preview as never,
          (body.segmentKinds as never[]) ?? [],
        ),
      )
    }

    if (method === 'POST' && path === '/rpc/staff_import_preview') {
      const body = await readJson(request)
      return json(
        200,
        api.previewStaffImport(
          ctx,
          (body.rows as never[]) ?? [],
          (body.sourceFile as string) ?? null,
        ),
      )
    }

    if (method === 'POST' && path === '/rpc/staff_import') {
      const body = await readJson(request)
      return json(200, api.commitStaffImport(ctx, body.preview as never))
    }

    if (method === 'POST' && path === '/rpc/equipment_import_preview') {
      const body = await readJson(request)
      return json(
        200,
        api.previewEquipmentImport(
          ctx,
          (body.rows as never[]) ?? [],
          (body.sourceFile as string) ?? null,
        ),
      )
    }

    if (method === 'POST' && path === '/rpc/equipment_import') {
      const body = await readJson(request)
      return json(200, api.commitEquipmentImport(ctx, body.preview as never))
    }

    if (method === 'POST' && path === '/rpc/units_import_preview') {
      const body = await readJson(request)
      return json(
        200,
        api.previewUnitsImport(
          ctx,
          (body.rows as never[]) ?? [],
          (body.sourceFile as string) ?? null,
        ),
      )
    }

    if (method === 'POST' && path === '/rpc/units_import') {
      const body = await readJson(request)
      return json(200, api.commitUnitsImport(ctx, body.preview as never))
    }

    if (method === 'POST' && path === '/rpc/fsa_import_preview') {
      const body = await readJson(request)
      return json(
        200,
        api.previewFsaImport(
          ctx,
          (body.rows as never[]) ?? [],
          body.catalog as never,
          (body.sourceFile as string) ?? null,
        ),
      )
    }

    if (method === 'POST' && path === '/rpc/fsa_import') {
      const body = await readJson(request)
      return json(200, api.commitFsaImport(ctx, body.preview as never))
    }

    if (method === 'POST' && path === '/rpc/customer_add_alias') {
      const body = await readJson(request)
      return json(
        200,
        api.addCustomerAlias(ctx, String(body.customerId), String(body.alias)),
      )
    }

    if (method === 'POST' && path === '/staff') {
      const body = await readJson(request)
      return json(200, api.createStaff(ctx, body as never))
    }

    if (method === 'PUT' && path.startsWith('/staff/')) {
      const id = path.slice('/staff/'.length)
      const body = await readJson(request)
      return json(200, api.updateStaff(ctx, id, body as never))
    }

    if (method === 'DELETE' && path.startsWith('/staff/')) {
      const id = path.slice('/staff/'.length)
      api.deleteStaff(ctx, id)
      return json(200, { ok: true })
    }

    if (method === 'POST' && path === '/oa-editions') {
      const body = await readJson(request)
      return json(200, api.createOaEdition(ctx, body as never))
    }

    if (method === 'PUT' && path.startsWith('/oa-editions/')) {
      const id = path.slice('/oa-editions/'.length)
      const body = await readJson(request)
      return json(200, api.updateOaEdition(ctx, id, body as never))
    }

    if (method === 'DELETE' && path.startsWith('/oa-editions/')) {
      const id = path.slice('/oa-editions/'.length)
      api.deleteOaEdition(ctx, id)
      return json(200, { ok: true })
    }

    if (method === 'POST' && path === '/oa-items') {
      const body = await readJson(request)
      return json(200, api.createOaItem(ctx, body as never))
    }

    if (method === 'PUT' && path.startsWith('/oa-items/')) {
      const id = path.slice('/oa-items/'.length)
      const body = await readJson(request)
      return json(200, api.updateOaItem(ctx, id, body as never))
    }

    if (method === 'DELETE' && path.startsWith('/oa-items/')) {
      const id = path.slice('/oa-items/'.length)
      api.deleteOaItem(ctx, id)
      return json(200, { ok: true })
    }

    if (method === 'POST' && path === '/rpc/equipment_verification') {
      const body = await readJson(request)
      return json(
        200,
        api.addEquipmentVerification(ctx, body as never),
      )
    }

    if (method === 'PUT' && path.startsWith('/equipment-verifications/')) {
      const id = path.slice('/equipment-verifications/'.length)
      const body = await readJson(request)
      return json(200, api.updateEquipmentVerification(ctx, id, body as never))
    }

    if (method === 'DELETE' && path.startsWith('/equipment-verifications/')) {
      const id = path.slice('/equipment-verifications/'.length)
      api.deleteEquipmentVerification(ctx, id)
      return json(200, { ok: true })
    }

    if (method === 'POST' && path === '/equipment') {
      const body = await readJson(request)
      return json(200, api.createEquipment(ctx, body as never))
    }

    if (method === 'PUT' && path.startsWith('/equipment/')) {
      const id = path.slice('/equipment/'.length)
      const body = await readJson(request)
      return json(200, api.updateEquipment(ctx, id, body as never))
    }

    if (method === 'DELETE' && path.startsWith('/equipment/')) {
      const id = path.slice('/equipment/'.length)
      api.deleteEquipment(ctx, id)
      return json(200, { ok: true })
    }

    if (method === 'PUT' && path === '/units') {
      const body = await readJson(request)
      return json(200, api.upsertUnit(ctx, body as never))
    }

    if (method === 'DELETE' && path.startsWith('/units/')) {
      const fgisId = decodeURIComponent(path.slice('/units/'.length))
      api.deleteUnit(ctx, fgisId)
      return json(200, { ok: true })
    }

    if (method === 'PUT' && path === '/unit-conversions') {
      const body = await readJson(request)
      return json(200, api.upsertUnitConversion(ctx, body as never))
    }

    if (method === 'DELETE' && path === '/unit-conversions') {
      const body = await readJson(request)
      api.deleteUnitConversion(
        ctx,
        String(body.fromSymbol),
        String(body.toSymbol),
      )
      return json(200, { ok: true })
    }

    if (method === 'PUT' && path.startsWith('/protocol-forms/')) {
      const id = path.slice('/protocol-forms/'.length)
      const body = await readJson(request)
      return json(200, api.updateProtocolForm(ctx, id, body as never))
    }

    if (method === 'POST' && path === '/rpc/form_indicator_map') {
      const body = await readJson(request)
      return json(200, api.upsertFormIndicatorMap(ctx, body as never))
    }

    return json(404, { error: 'NOT_FOUND', message: 'Маршрут не найден' })
  } catch (err) {
    return errorResponse(err)
  }
}

function resolveAuth(api: SecureApi, request: Request): AuthContext {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  return api.auth.resolveToken(token)
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.method === 'GET' || request.method === 'HEAD') return {}
  const text = await request.text()
  if (!text) return {}
  return JSON.parse(text) as Record<string, unknown>
}

function json(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function errorResponse(err: unknown): Response {
  if (err instanceof SecurityError) {
    return json(err.httpStatus, { error: err.code, message: err.message })
  }
  if (err instanceof DomainError) {
    const status =
      err.code === 'FORBIDDEN' || err.code === 'STATUS_IMMUTABLE' ? 403 : 400
    return json(status, { error: err.code, message: err.message })
  }
  console.error(err)
  return json(500, { error: 'INTERNAL', message: 'Внутренняя ошибка сервера' })
}
