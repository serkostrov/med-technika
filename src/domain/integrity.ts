import type {
  Equipment,
  EquipmentVerification,
  FgisExport,
  FgisExportItem,
  FormIndicatorMap,
  OaEdition,
  OaItem,
  Protocol,
  ProtocolEquipment,
  ProtocolForm,
  ProtocolIssue,
  ProtocolObject,
  ProtocolResult,
  Unit,
  UnitConversion,
} from './entities'
import { isActive } from './primitives'

export type DomainSnapshot = {
  oaEditions: readonly OaEdition[]
  oaItems: readonly OaItem[]
  units: readonly Unit[]
  unitConversions: readonly UnitConversion[]
  equipment: readonly Equipment[]
  equipmentVerifications: readonly EquipmentVerification[]
  protocolForms: readonly ProtocolForm[]
  formIndicatorMaps: readonly FormIndicatorMap[]
  protocols: readonly Protocol[]
  protocolObjects: readonly ProtocolObject[]
  protocolResults: readonly ProtocolResult[]
  protocolEquipment: readonly ProtocolEquipment[]
  protocolIssues: readonly ProtocolIssue[]
  fgisExports: readonly FgisExport[]
  fgisExportItems: readonly FgisExportItem[]
}

export type IntegrityViolation = {
  code: string
  message: string
}

/**
 * Проверка связей и ограничений целостности доменной модели (без БД).
 */
export function checkDomainIntegrity(snap: DomainSnapshot): IntegrityViolation[] {
  const violations: IntegrityViolation[] = []
  const editionIds = new Set(snap.oaEditions.map((e) => e.id))
  const oaItemIds = new Set(snap.oaItems.map((i) => i.id))
  const unitIds = new Set(snap.units.map((u) => u.fgisId))
  const equipmentIds = new Set(snap.equipment.map((e) => e.id))
  const formIds = new Set(snap.protocolForms.map((f) => f.id))
  const protocolIds = new Set(snap.protocols.map((p) => p.id))
  const exportIds = new Set(snap.fgisExports.map((e) => e.id))
  const objectIds = new Set(snap.protocolObjects.map((o) => o.id))

  for (const item of snap.oaItems) {
    if (!editionIds.has(item.editionId)) {
      violations.push({
        code: 'OA_ITEM_EDITION',
        message: `oa_item ${item.id} ссылается на неизвестную редакцию ${item.editionId}`,
      })
    }
  }

  for (const v of snap.equipmentVerifications) {
    if (!equipmentIds.has(v.equipmentId)) {
      violations.push({
        code: 'VERIFICATION_EQUIPMENT',
        message: `verification ${v.id} → неизвестное оборудование ${v.equipmentId}`,
      })
    }
  }

  for (const m of snap.formIndicatorMaps) {
    if (!formIds.has(m.formId)) {
      violations.push({
        code: 'MAP_FORM',
        message: `form_indicator_map ${m.id} → неизвестная форма ${m.formId}`,
      })
    }
    if (!oaItemIds.has(m.oaItemId)) {
      violations.push({
        code: 'MAP_OA',
        message: `form_indicator_map ${m.id} → неизвестная позиция ОА ${m.oaItemId}`,
      })
    }
  }

  const mapKeys = new Set<string>()
  for (const m of snap.formIndicatorMaps) {
    const key = `${m.formId}::${m.sourceKey}`
    if (mapKeys.has(key)) {
      violations.push({
        code: 'MAP_UNIQUE',
        message: `Дубликат form_indicator_map (${m.formId}, ${m.sourceKey})`,
      })
    }
    mapKeys.add(key)
  }

  const numDate = new Set<string>()
  for (const p of snap.protocols) {
    if (!isActive(p)) continue
    if (!formIds.has(p.formId)) {
      violations.push({
        code: 'PROTOCOL_FORM',
        message: `protocol ${p.id} → неизвестная форма ${p.formId}`,
      })
    }
    const nd = `${p.number}::${p.protocolDate}`
    if (numDate.has(nd)) {
      violations.push({
        code: 'PROTOCOL_NUM_DATE_UQ',
        message: `Нарушение уникальности номер+дата: ${p.number} ${p.protocolDate}`,
      })
    }
    numDate.add(nd)
  }

  for (const o of snap.protocolObjects) {
    if (!protocolIds.has(o.protocolId)) {
      violations.push({
        code: 'OBJECT_PROTOCOL',
        message: `protocol_object ${o.id} → неизвестный протокол`,
      })
    }
  }

  for (const r of snap.protocolResults) {
    if (!protocolIds.has(r.protocolId)) {
      violations.push({
        code: 'RESULT_PROTOCOL',
        message: `protocol_result ${r.id} → неизвестный протокол`,
      })
    }
    if (r.objectId && !objectIds.has(r.objectId)) {
      violations.push({
        code: 'RESULT_OBJECT',
        message: `protocol_result ${r.id} → неизвестный объект ${r.objectId}`,
      })
    }
    if (r.oaItemId && !oaItemIds.has(r.oaItemId)) {
      violations.push({
        code: 'RESULT_OA',
        message: `protocol_result ${r.id} → неизвестная ОА ${r.oaItemId}`,
      })
    }
  }

  for (const pe of snap.protocolEquipment) {
    if (!protocolIds.has(pe.protocolId)) {
      violations.push({
        code: 'PE_PROTOCOL',
        message: `protocol_equipment seq=${pe.seq} → неизвестный протокол`,
      })
    }
    if (pe.equipmentId && !equipmentIds.has(pe.equipmentId)) {
      violations.push({
        code: 'PE_EQUIPMENT',
        message: `protocol_equipment → неизвестное СИ ${pe.equipmentId}`,
      })
    }
  }

  for (const issue of snap.protocolIssues) {
    if (!protocolIds.has(issue.protocolId)) {
      violations.push({
        code: 'ISSUE_PROTOCOL',
        message: `issue ${issue.id} → неизвестный протокол`,
      })
    }
  }

  for (const item of snap.fgisExportItems) {
    if (!exportIds.has(item.exportId)) {
      violations.push({
        code: 'EXPORT_ITEM_EXPORT',
        message: `fgis_export_item → неизвестная выгрузка ${item.exportId}`,
      })
    }
    if (!protocolIds.has(item.protocolId)) {
      violations.push({
        code: 'EXPORT_ITEM_PROTOCOL',
        message: `fgis_export_item → неизвестный протокол ${item.protocolId}`,
      })
    }
  }

  const convKeys = new Set<string>()
  for (const c of snap.unitConversions) {
    const key = `${c.fromSymbol}::${c.toSymbol}`
    if (convKeys.has(key)) {
      violations.push({
        code: 'CONV_UNIQUE',
        message: `Дубликат unit_conversion ${key}`,
      })
    }
    convKeys.add(key)
  }

  // units.symbol uniqueness is not required by TZ (fgis_id is PK); skip
  void unitIds

  return violations
}

/** Старые ссылки на ОА остаются валидными после деактивации редакции. */
export function oaLinksSurviveDeactivation(
  editions: readonly OaEdition[],
  items: readonly OaItem[],
  resultOaIds: readonly (string | null)[],
): boolean {
  const itemById = new Map(items.map((i) => [i.id, i]))
  for (const oaId of resultOaIds) {
    if (!oaId) continue
    const item = itemById.get(oaId)
    if (!item) return false
    const edition = editions.find((e) => e.id === item.editionId)
    if (!edition) return false
    // ссылка валидна даже если edition.isActive === false
  }
  return true
}
