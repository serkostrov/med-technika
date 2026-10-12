/**
 * Минимальная XSD-схема пакета ФГИС по правилам ТЗ §10.2.
 * Клиентский XSD при появлении заменяет этот файл; валидатор читает sequence отсюда.
 */
export const FGIS_PROTOCOL_XSD = `<?xml version="1.0" encoding="utf-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" elementFormDefault="qualified">
  <xs:element name="Protocols">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="protocol" maxOccurs="100" type="ProtocolType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>

  <xs:complexType name="ProtocolType">
    <xs:sequence>
      <xs:element name="DocId" type="xs:string"/>
      <xs:element name="DocCreationDate" type="xs:string"/>
      <xs:element name="DocStartDate" type="xs:string"/>
      <xs:element name="DocValidityDate" type="xs:string"/>
      <xs:element name="DataStatusId" type="xs:string"/>
      <xs:element name="ProtocolStatusId" type="xs:string"/>
      <xs:element name="ProtocolScan" type="ProtocolScanType"/>
      <xs:element name="TerritoryFeature" type="xs:string"/>
      <xs:choice>
        <xs:element name="AddressID" type="xs:string"/>
        <xs:element name="Address" type="AddressType"/>
      </xs:choice>
      <xs:element name="ApplicationDate" type="xs:string"/>
      <xs:element name="Customer" type="CustomerType"/>
      <xs:element name="AccredScope353" type="xs:string" minOccurs="0"/>
      <xs:element name="NoEquipmentInfo" type="xs:string"/>
      <xs:element name="Equipment" type="EquipmentType"/>
      <xs:element name="ApprovedUser" type="ApprovedUserType"/>
      <xs:element name="ObjectInfo" type="ObjectInfoType"/>
      <xs:element name="ModelGetDate" type="xs:string" minOccurs="0"/>
      <xs:element name="FullNameObject" type="xs:string"/>
      <xs:element name="ResearchObject" type="ResearchObjectType" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="ProtocolScanType">
    <xs:sequence>
      <xs:element name="Extension" type="xs:string"/>
      <xs:element name="FileName" type="xs:string"/>
      <xs:element name="Content" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="AddressType">
    <xs:sequence>
      <xs:element name="AddressDetails" type="AddressDetailsType"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="AddressDetailsType">
    <xs:sequence>
      <xs:element name="idCodeOksm" type="xs:string"/>
      <xs:element name="IdAddrType" type="xs:string"/>
      <xs:element name="UniqueAddress" type="xs:string"/>
      <xs:element name="UniqueAddressText" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="CustomerType">
    <xs:sequence>
      <xs:element name="CustomerKindId" type="xs:string"/>
      <xs:element name="InnId" type="xs:string" minOccurs="0"/>
      <xs:element name="OgrnId" type="xs:string" minOccurs="0"/>
      <xs:element name="Phones" type="PhonesType" minOccurs="0"/>
      <xs:element name="Address" type="AddressType" minOccurs="0"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="PhonesType">
    <xs:sequence>
      <xs:element name="PhoneDetails" maxOccurs="unbounded">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="Number" type="xs:string"/>
            <xs:element name="IsRf" type="xs:string"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="EquipmentType">
    <xs:sequence>
      <xs:element name="EquipmentDetails" maxOccurs="unbounded">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="EquipmentId" type="xs:string"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="ApprovedUserType">
    <xs:sequence>
      <xs:element name="ApprovedUserDetails" maxOccurs="unbounded">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="idFullName" type="xs:string"/>
            <xs:element name="PostName" type="xs:string"/>
            <xs:element name="idRoleName" type="xs:string"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="ObjectInfoType">
    <xs:sequence>
      <xs:element name="TypeObjectId" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="ResearchObjectType">
    <xs:sequence>
      <xs:element name="ResearchObjectInfo" type="ResearchObjectInfoType"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="ResearchObjectInfoType">
    <xs:sequence>
      <xs:element name="IndicatorId" type="xs:string"/>
      <xs:element name="UniqueIndicator" type="xs:string"/>
      <xs:element name="Directory" type="xs:string"/>
      <xs:element name="FactValue" type="xs:string"/>
      <xs:element name="MeasurementId" type="xs:string"/>
      <xs:element name="DocNameId" type="xs:string"/>
      <xs:element name="UniqueMethod" type="xs:string"/>
      <xs:element name="DocNameMethodikId" type="xs:string"/>
      <xs:element name="IsLab" type="xs:string"/>
      <xs:element name="IsAnotherDoc" type="xs:string"/>
      <xs:element name="AnotherDoc" type="AnotherDocType"/>
    </xs:sequence>
  </xs:complexType>

  <xs:complexType name="AnotherDocType">
    <xs:sequence>
      <xs:element name="AnotherDocDetails">
        <xs:complexType>
          <xs:sequence>
            <xs:element name="AnotherDocName" type="xs:string"/>
            <xs:element name="AnotherDocNumber" type="xs:string"/>
          </xs:sequence>
        </xs:complexType>
      </xs:element>
    </xs:sequence>
  </xs:complexType>
</xs:schema>
`

/** Порядок дочерних элементов protocol по XSD sequence (ТЗ §10.2). */
export const PROTOCOL_CHILD_SEQUENCE = [
  'DocId',
  'DocCreationDate',
  'DocStartDate',
  'DocValidityDate',
  'DataStatusId',
  'ProtocolStatusId',
  'ProtocolScan',
  'TerritoryFeature',
  // AddressID | Address — choice
  'AddressID',
  'Address',
  'ApplicationDate',
  'Customer',
  'AccredScope353',
  'NoEquipmentInfo',
  'Equipment',
  'ApprovedUser',
  'ObjectInfo',
  'ModelGetDate',
  'FullNameObject',
  'ResearchObject',
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
  'IsLab',
  'IsAnotherDoc',
  'AnotherDoc',
] as const
