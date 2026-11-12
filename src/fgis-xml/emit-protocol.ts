import type {
  Customer,
  Equipment,
  OaItem,
  Protocol,
  ProtocolEquipment,
  ProtocolForm,
  ProtocolResult,
  Setting,
  Staff,
  Unit,
} from '@/domain'
import { el, wrap } from './escape'
import { arrayBufferToBase64, toFgisPhone } from './util'

export type ProtocolXmlContext = {
  protocol: Protocol
  form: ProtocolForm
  customer: Customer
  engineer: Staff
  approver: Staff
  results: ProtocolResult[]
  equipmentRows: ProtocolEquipment[]
  equipmentById: Map<string, Equipment>
  oaById: Map<string, OaItem>
  unitsBySymbol: Map<string, Unit>
  settings: Setting[]
  /** PDF одного протокола; после эмита не удерживаем снаружи. */
  pdfBytes: ArrayBuffer | null
  /** Preview: Content пустой. */
  omitContent: boolean
}

function settingValue(settings: Setting[], key: string): unknown {
  return settings.find((s) => s.key === key)?.value
}

function labAddressText(settings: Setting[]): string {
  const v = settingValue(settings, 'lab_address_text')
  return typeof v === 'string' ? v.trim() : 'пер. Искожевский, 16'
}

function labAddressId(settings: Setting[]): string {
  const v = settingValue(settings, 'lab_address_id')
  return v != null ? String(v) : '766884'
}

/**
 * Адрес места измерений = адрес ИЛ? Настройка — короткая («пер. Искожевский, 16»),
 * в протоколе — полный («610005, …, переулок Искожевский, дом 16, пом. 1002…», 26-СЗ).
 * Совпадение: все значимые слова (≥ 4 букв) и номера из настройки есть в адресе.
 */
export function isLabAddress(address: string, labText: string): boolean {
  const a = address.toLowerCase()
  const lab = labText.toLowerCase().trim()
  if (!lab) return false
  if (a === lab) return true
  const tokens = lab.match(/[a-zа-яё]{4,}|\d+/gi) ?? []
  if (tokens.length === 0) return false
  return tokens.every((t) =>
    /^\d+$/.test(t)
      ? new RegExp(`(^|\\D)${t}(\\D|$)`).test(a)
      : a.includes(t),
  )
}

function addressDetails(idAddrType: number, uniqueAddressText: string): string {
  return wrap(
    'AddressDetails',
    [
      el('idCodeOksm', 643),
      el('IdAddrType', idAddrType),
      el('UniqueAddress', true),
      el('UniqueAddressText', uniqueAddressText),
    ].join(''),
  )
}

function emitCustomer(c: Customer, protocolPhone: string | null): string {
  const parts: string[] = [el('CustomerKindId', c.kindId)]
  if (c.inn?.trim()) parts.push(el('InnId', c.inn.trim()))
  if (c.ogrn?.trim()) parts.push(el('OgrnId', c.ogrn.trim()))

  const phone = toFgisPhone(protocolPhone ?? c.phone)
  if (phone) {
    parts.push(
      wrap(
        'Phones',
        wrap('PhoneDetails', [el('Number', phone), el('IsRf', true)].join('')),
      ),
    )
  }

  const legal = c.legalAddress?.trim()
  if (legal) {
    parts.push(wrap('Address', addressDetails(1, legal)))
  }

  return wrap('Customer', parts.join(''))
}

function emitEquipment(
  rows: ProtocolEquipment[],
  byId: Map<string, Equipment>,
): string {
  const seen = new Set<number>()
  const details: string[] = []
  for (const row of [...rows].sort((a, b) => a.seq - b.seq)) {
    if (!row.equipmentId) continue
    const eq = byId.get(row.equipmentId)
    if (!eq?.fgisEquipmentId) continue
    if (seen.has(eq.fgisEquipmentId)) continue
    seen.add(eq.fgisEquipmentId)
    details.push(wrap('EquipmentDetails', el('EquipmentId', eq.fgisEquipmentId)))
  }
  return wrap('Equipment', details.join(''))
}

function emitApprovedUser(engineer: Staff, approver: Staff): string {
  return wrap(
    'ApprovedUser',
    [
      wrap(
        'ApprovedUserDetails',
        [
          el('idFullName', engineer.fgisIdFullName!),
          el('PostName', engineer.postName ?? 'Испытатель'),
          el('idRoleName', engineer.fgisRoleIds[0] ?? 1),
        ].join(''),
      ),
      wrap(
        'ApprovedUserDetails',
        [
          el('idFullName', approver.fgisIdFullName!),
          el('PostName', approver.postName ?? 'Руководитель'),
          el('idRoleName', approver.fgisRoleIds[0] ?? 2),
        ].join(''),
      ),
    ].join(''),
  )
}

function emitResearch(result: ProtocolResult, ctx: ProtocolXmlContext): string {
  const oa = result.oaItemId ? ctx.oaById.get(result.oaItemId) : undefined
  const indicatorId = oa?.indicatorFgisId?.trim() ?? ''
  const uniqueIndicator = indicatorId ? '' : (oa?.indicatorText ?? '')

  const methodikId = oa?.methodikFgisId
  const methodikText = oa?.methodikText?.trim() ?? ''
  const docNameId = methodikId != null ? String(methodikId) : ''
  const uniqueMethod = methodikId != null ? '' : methodikText

  const methodikDocId = oa?.methodFgisId != null ? String(oa.methodFgisId) : ''

  const unit = result.unitSymbol
    ? ctx.unitsBySymbol.get(result.unitSymbol)
    : undefined

  const info = [
    el('IndicatorId', indicatorId),
    el('UniqueIndicator', uniqueIndicator),
    // справочник — настройка формы (у 26-Ш и др. рабочих мест он пустой)
    el('Directory', ctx.form.fgisDirectory),
    el('FactValue', result.factValue),
    el('MeasurementId', unit?.fgisId ?? ''),
    el('DocNameId', docNameId),
    el('UniqueMethod', uniqueMethod),
    el('DocNameMethodikId', methodikDocId),
  ].join('')

  return wrap('ResearchObjectInfo', info)
}

/**
 * Один блок <protocol>…</protocol> (ТЗ §10.2).
 * FactValue — из протокола, без пересчёта.
 */
export function emitProtocolXml(ctx: ProtocolXmlContext): string {
  const p = ctx.protocol
  const labText = labAddressText(ctx.settings)
  const measureAddr = (p.measureAddress ?? '').trim()
  const territory = measureAddr.length > 0 && !isLabAddress(measureAddr, labText)

  const content =
    ctx.omitContent || !ctx.pdfBytes
      ? ''
      : arrayBufferToBase64(ctx.pdfBytes)

  const parts: string[] = [
    el('DocId', p.number),
    el('DocCreationDate', p.protocolDate),
    el('DocStartDate', p.measureStart ?? ''),
    el('DocValidityDate', p.measureEnd ?? ''),
    el('DataStatusId', 20),
    el('ProtocolStatusId', 6),
    wrap(
      'ProtocolScan',
      [
        el('Extension', 'pdf'),
        el('FileName', `${p.number} скан`),
        el('Content', content),
      ].join(''),
    ),
  ]

  // Официальная XSD: AddressID стоит перед TerritoryFeature, Address — после.
  if (!territory) {
    parts.push(el('AddressID', labAddressId(ctx.settings)))
  }
  parts.push(el('TerritoryFeature', territory))
  if (territory) {
    parts.push(wrap('Address', addressDetails(3, measureAddr)))
  }

  parts.push(el('ApplicationDate', p.applicationDate ?? ''))
  parts.push(emitCustomer(ctx.customer, p.customerPhone))

  if (p.accredScope353) {
    parts.push(el('AccredScope353', true))
  }

  parts.push(el('NoEquipmentInfo', false))
  parts.push(emitEquipment(ctx.equipmentRows, ctx.equipmentById))
  parts.push(emitApprovedUser(ctx.engineer, ctx.approver))

  // ObjectInfo — контейнер объекта и результатов (актуальная XSD ФГИС:
  // ModelGetDate / FullNameObject / ResearchObject не являются детьми protocol).
  const typeObjectId = ctx.form.typeObjectId ?? 1
  const objectParts: string[] = [el('TypeObjectId', typeObjectId)]
  // «Дата получения образца» — только для продукции (TypeObjectId=1);
  // у рабочих мест / помещений / вентиляции в эталонах её нет
  const modelGet =
    typeObjectId === 1 ? (p.modelGetDate ?? p.measureStart) : null
  if (modelGet) {
    objectParts.push(el('ModelGetDate', modelGet))
  }
  objectParts.push(el('FullNameObject', p.objectFullName ?? ''))

  const results = [...ctx.results]
    .filter((r) => r.includeInXml)
    .sort((a, b) => a.seq - b.seq)
  // Официальная XSD: один ResearchObject со всеми ResearchObjectInfo,
  // IsLab / IsAnotherDoc / AnotherDoc — один раз на уровне ObjectInfo.
  if (results.length > 0) {
    objectParts.push(
      wrap('ResearchObject', results.map((r) => emitResearch(r, ctx)).join('')),
    )
  }
  objectParts.push(el('IsLab', false))
  objectParts.push(el('IsAnotherDoc', true))
  objectParts.push(
    wrap(
      'AnotherDoc',
      wrap(
        'AnotherDocDetails',
        [el('AnotherDocName', '-'), el('AnotherDocNumber', '-')].join(''),
      ),
    ),
  )

  parts.push(wrap('ObjectInfo', objectParts.join('')))

  return wrap('protocol', parts.join(''))
}

export function wrapProtocolsDocument(protocolXmlChunks: string[]): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<root>${protocolXmlChunks.join('')}</root>`
  )
}
