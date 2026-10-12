import {
  CustomerKindId,
  EquipmentKind,
  ProtocolStatus,
  type Protocol,
  type ProtocolResult,
} from '@/domain'
import { SeedIds } from '@/data/ids'
import type { Database } from '@/server/db/database'
import { minimalPdfBytes } from './minimal-pdf'

export type ReferenceKind = 'uhf' | 'mt' | 'df'

const REF: Record<
  ReferenceKind,
  {
    number: string
    formId: string
    objectFullName: string
    results: { sourceKey: string; factValue: string; unit: string; oaItemId: string }[]
  }
> = {
  uhf: {
    number: '20-26-УВЧ',
    formId: SeedIds.formUhf,
    objectFullName: 'Медицинские аппараты коротковолновой (УВЧ) терапии',
    results: [
      { sourceKey: 'выходная мощность, вт', factValue: '63,3', unit: 'Вт', oaItemId: SeedIds.oaItemUhfPower },
      { sourceKey: 'выходная мощность, вт#2', factValue: '87,4', unit: 'Вт', oaItemId: SeedIds.oaItemUhfPower },
      { sourceKey: 'выходная мощность, вт#3', factValue: '21,1', unit: 'Вт', oaItemId: SeedIds.oaItemUhfPower },
      { sourceKey: 'выходная мощность, вт#4', factValue: '7,0', unit: 'Вт', oaItemId: SeedIds.oaItemUhfPower },
      { sourceKey: 'выходная мощность, вт#5', factValue: '14,5', unit: 'Вт', oaItemId: SeedIds.oaItemUhfPower },
      { sourceKey: 'рабочая частота, мгц', factValue: '27,130', unit: 'МГц', oaItemId: SeedIds.oaItemUhfFreq },
      { sourceKey: 'рабочая частота, мгц#2', factValue: '27,220', unit: 'МГц', oaItemId: SeedIds.oaItemUhfFreq },
      { sourceKey: 'рабочая частота, мгц#3', factValue: '27,687', unit: 'МГц', oaItemId: SeedIds.oaItemUhfFreq },
      { sourceKey: 'рабочая частота, мгц#4', factValue: '40,563', unit: 'МГц', oaItemId: SeedIds.oaItemUhfFreq },
    ],
  },
  mt: {
    number: '44-26-МТ',
    formId: SeedIds.formLf,
    objectFullName: 'Аппарат низкочастотной терапии',
    results: [
      { sourceKey: 'сила тока, ма', factValue: '5,09', unit: 'мА', oaItemId: SeedIds.oaItemLfCurrent },
      { sourceKey: 'сила тока, ма#2', factValue: '10,34', unit: 'мА', oaItemId: SeedIds.oaItemLfCurrent },
      { sourceKey: 'сила тока, ма#3', factValue: '25,13', unit: 'мА', oaItemId: SeedIds.oaItemLfCurrent },
      { sourceKey: 'сила тока, ма#4', factValue: '48,83', unit: 'мА', oaItemId: SeedIds.oaItemLfCurrent },
      { sourceKey: 'сила тока, ма#5', factValue: '92,47', unit: 'мА', oaItemId: SeedIds.oaItemLfCurrent },
    ],
  },
  df: {
    number: '26-26-ДФ',
    formId: SeedIds.formDf,
    objectFullName: 'Дефибриллятор PRIMEDIC Defi-B',
    results: [
      { sourceKey: 'energy_le2kv', factValue: '7', unit: 'Дж', oaItemId: SeedIds.oaItemDfEnergy },
      { sourceKey: 'energy_le2kv#2', factValue: '21', unit: 'Дж', oaItemId: SeedIds.oaItemDfEnergy },
      { sourceKey: 'energy_le2kv#3', factValue: '39', unit: 'Дж', oaItemId: SeedIds.oaItemDfEnergy },
      { sourceKey: 'energy_2_8kv', factValue: '70', unit: 'Дж', oaItemId: SeedIds.oaItemDfEnergy },
      { sourceKey: 'energy_2_8kv#2', factValue: '119', unit: 'Дж', oaItemId: SeedIds.oaItemDfEnergy },
      { sourceKey: 'energy_2_8kv#3', factValue: '163', unit: 'Дж', oaItemId: SeedIds.oaItemDfEnergy },
      { sourceKey: 'energy_2_8kv#4', factValue: '197', unit: 'Дж', oaItemId: SeedIds.oaItemDfEnergy },
      { sourceKey: 'energy_2_8kv#5', factValue: '222', unit: 'Дж', oaItemId: SeedIds.oaItemDfEnergy },
      { sourceKey: 'energy_2_8kv#6', factValue: '280', unit: 'Дж', oaItemId: SeedIds.oaItemDfEnergy },
      { sourceKey: 'interval', factValue: '9,4', unit: 'с', oaItemId: SeedIds.oaItemDfInterval },
    ],
  },
}

/**
 * Готовит эталонный протокол App. A в статусе ready со сканом PDF.
 */
export function seedReferenceProtocol(
  db: Database,
  kind: ReferenceKind,
  uploadedBy: string,
): string {
  const spec = REF[kind]
  ensureCustomerAndEquipment(db)

  const protocolId = crypto.randomUUID()
  const scanPath = `protocol-scans/${protocolId}/scan.pdf`
  db.protocolScans.set(scanPath, {
    path: scanPath,
    fileName: `${spec.number} скан.pdf`,
    bytes: minimalPdfBytes(spec.number),
    uploadedAt: '2026-09-22T12:00:00.000Z',
    uploadedBy,
  })

  const protocol: Protocol = {
    id: protocolId,
    number: spec.number,
    protocolDate: '2026-09-22',
    measureStart: '2026-09-18',
    measureEnd: '2026-09-18',
    modelGetDate: '2026-09-18',
    applicationDate: '2026-09-10',
    formId: spec.formId,
    customerId: REF_CUSTOMER_ID,
    raw: {},
    objectFullName: spec.objectFullName,
    measurePlace: 'Кабинет',
    measureAddress: 'пер. Искожевский, 16',
    territoryFeature: false,
    customerPhone: '88362380322',
    conditions: { t: 22, rh: 40, p: 100 },
    engineerStaffId: SeedIds.staffSudnitsyn,
    accredScope353: false,
    status: ProtocolStatus.ready,
    sourcePath: `${spec.number}.xlsx`,
    sourceSha256: 'c'.repeat(64),
    parserVersion: 'test',
    scanPath,
    uploadedBy,
    uploadedAt: '2026-09-22T10:00:00.000Z',
    approvedBy: SeedIds.staffSadakov,
    approvedAt: '2026-09-22T11:00:00.000Z',
    deletedAt: null,
  }
  db.protocols.push(protocol)

  const objectId = crypto.randomUUID()
  db.protocolObjects.push({
    id: objectId,
    protocolId,
    seq: 1,
    name: spec.objectFullName,
    serialNo: 'SN',
    year: '2020',
    department: null,
  })

  spec.results.forEach((r, i) => {
    const row: ProtocolResult = {
      id: crypto.randomUUID(),
      protocolId,
      objectId,
      seq: i + 1,
      sourceKey: r.sourceKey,
      indicatorRaw: r.sourceKey,
      unitSymbol: r.unit,
      setValue: null,
      rawValues: [1, 1, 1, 1],
      avgExcel: 1,
      uExcel: 0.1,
      avgCalc: 1,
      uCalc: 0.1,
      numberFormat: '0.0',
      displayExcel: 1,
      factValue: r.factValue,
      oaItemId: r.oaItemId,
      includeInXml: true,
    }
    db.protocolResults.push(row)
  })

  db.protocolEquipment.push({
    protocolId,
    seq: 1,
    equipmentId: REF_EQ_ID,
    rawText: 'СИ эталон',
    serialRaw: 'REF-1',
    certRaw: 'С-REF',
    validUntilRaw: '2027-12-31',
    kind: EquipmentKind.si,
  })
  // дубль того же EquipmentId — должен схлопнуться в XML
  db.protocolEquipment.push({
    protocolId,
    seq: 2,
    equipmentId: REF_EQ_ID,
    rawText: 'СИ эталон повтор',
    serialRaw: 'REF-1',
    certRaw: 'С-REF',
    validUntilRaw: '2027-12-31',
    kind: EquipmentKind.aux,
  })

  db.equipmentVerifications.push({
    id: crypto.randomUUID(),
    equipmentId: REF_EQ_ID,
    certNo: 'С-REF',
    verifiedOn: '2025-01-01',
    validUntil: '2027-12-31',
    createdAt: '2025-01-01T00:00:00.000Z',
    deletedAt: null,
  })

  return protocolId
}

export const REF_CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
export const REF_EQ_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'

function ensureCustomerAndEquipment(db: Database): void {
  if (!db.customers.some((c) => c.id === REF_CUSTOMER_ID)) {
    db.customers.push({
      id: REF_CUSTOMER_ID,
      name: 'ООО «Эталон»',
      nameAliases: [],
      kindId: CustomerKindId.legalEntity,
      inn: '1215207448',
      ogrn: '1161215050699',
      phone: '88362380322',
      email: null,
      legalAddress: 'г. Йошкар-Ола',
      actualAddress: 'г. Йошкар-Ола',
      createdAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    })
  }
  if (!db.equipment.some((e) => e.id === REF_EQ_ID)) {
    db.equipment.push({
      id: REF_EQ_ID,
      name: 'СИ эталон',
      serialNo: 'REF-1',
      serialNorm: 'REF-1',
      invNo: null,
      fgisEquipmentId: 100001,
      kind: EquipmentKind.si,
      isActive: true,
      deletedAt: null,
    })
  }
}
