import officialXsd from './fgis-official.xsd?raw'

/**
 * XSD-схема пакета ФГИС: официальный файл клиента «XSD-схема для пакетной
 * загрузки протоколов» (fgis-official.xsd). Ниже — sequence, которые
 * проверяет встроенный структурный валидатор. Исходная минимальная схема пакета ФГИС по правилам ТЗ §10.2 и актуального
 * загрузчика ФГИС Росаккредитации (JAXB).
 * Корневой элемент — root (историческое имя Protocols отклоняется).
 * ModelGetDate / FullNameObject / ResearchObject — дети ObjectInfo, не protocol.
 * Клиентский XSD при появлении заменяет этот файл; валидатор читает sequence отсюда.
 */
export const FGIS_PROTOCOL_XSD: string = officialXsd

/** Порядок дочерних элементов protocol по XSD sequence (ТЗ §10.2). */
export const PROTOCOL_CHILD_SEQUENCE = [
  'DocId',
  'DocCreationDate',
  'DocStartDate',
  'DocValidityDate',
  'DataStatusId',
  'ProtocolStatusId',
  'ProtocolScan',
  // AddressID (до TerritoryFeature) | Address (после) — ровно один
  'AddressID',
  'TerritoryFeature',
  'Address',
  'ApplicationDate',
  'Customer',
  'AccredScope353',
  'NoEquipmentInfo',
  'Equipment',
  'ApprovedUser',
  'ObjectInfo',
] as const

/** Порядок дочерних элементов ObjectInfo. */
export const OBJECT_INFO_SEQUENCE = [
  'TypeObjectId',
  'ModelGetDate',
  'FullNameObject',
  'ResearchObject',
  'IsLab',
  'IsAnotherDoc',
  'AnotherDoc',
] as const

export const RESEARCH_INFO_SEQUENCE = [
  'IndicatorId',
  'UniqueIndicator',
  'Directory',
  'FactValue',
  'MeasurementId',
  'DocNameId',
  'UniqueMethod',
  'DocNameMethodikId',
] as const
