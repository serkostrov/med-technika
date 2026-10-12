import {
  AppRole,
  CustomerKindId,
  DomainError,
  softDelete,
  type Customer,
  type CustomerKindId as CustomerKind,
  type Equipment,
  type EquipmentKind,
  type EquipmentVerification,
  type FormIndicatorMap,
  type FormStatus,
  type FsaEntry,
  type OaEdition,
  type OaEditionKind,
  type OaItem,
  type ProtocolForm,
  type Setting,
  type Staff,
  type Unit,
  type UnitConversion,
} from '@/domain'
import type { Database } from '@/server/db/database'
import { normalizeCustomerName, normalizeSerial } from '@/dictionaries/normalize/text'
import { deriveShortName, deriveSurname } from '@/shared/staff-name'
import {
  previewOaImport,
  type OaImportPreview,
} from '@/dictionaries/import/oa'
import {
  previewStaffImport,
  type StaffImportPreview,
} from '@/dictionaries/import/staff'
import {
  previewEquipmentImport,
  type EquipmentImportPreview,
} from '@/dictionaries/import/equipment'
import {
  previewUnitsImport,
  type UnitsImportPreview,
} from '@/dictionaries/import/units'
import {
  previewFsaImport,
  type FsaCatalog,
  type FsaImportPreview,
} from '@/dictionaries/import/fsa'
import type { AuditWriter, ExcelRow } from '@/dictionaries/import/types'
import { notFound } from '@/security'

/**
 * Самостоятельный модуль справочников и импортов (ТЗ §12).
 * Запись только после явного commit превью. Все правки — в audit.
 */
export class DictionaryService {
  private readonly db: Database
  private readonly audit: AuditWriter

  constructor(db: Database, audit: AuditWriter) {
    this.db = db
    this.audit = audit
  }

  // ── Read ──────────────────────────────────────────────

  snapshot() {
    return {
      oaEditions: this.db.oaEditions.map((e) => ({ ...e })),
      oaItems: this.db.oaItems.filter((i) => i.deletedAt === null).map((i) => ({ ...i })),
      staff: this.db.staff.filter((s) => s.deletedAt === null).map((s) => ({ ...s })),
      equipment: this.db.equipment
        .filter((e) => e.deletedAt === null)
        .map((e) => ({ ...e })),
      equipmentVerifications: this.db.equipmentVerifications
        .filter((v) => v.deletedAt === null)
        .map((v) => ({ ...v })),
      units: this.db.units.map((u) => ({ ...u })),
      unitConversions: this.db.unitConversions.map((c) => ({ ...c })),
      customers: this.db.customers
        .filter((c) => c.deletedAt === null)
        .map((c) => ({ ...c })),
      measurementKinds: this.db.measurementKinds.map((k) => ({ ...k })),
      protocolForms: this.db.protocolForms.map((f) => ({ ...f })),
      formIndicatorMaps: this.db.formIndicatorMaps.map((m) => ({ ...m })),
      fsaEntries: this.db.fsaEntries.map((e) => ({ ...e })),
      settings: this.db.settings.map((s) => ({ ...s })),
    }
  }

  // ── Preview (без записи) ──────────────────────────────

  previewOa(rows: ExcelRow[], sourceFile: string | null = null): OaImportPreview {
    return previewOaImport(rows, sourceFile)
  }

  previewStaff(rows: ExcelRow[], sourceFile: string | null = null): StaffImportPreview {
    return previewStaffImport(rows, sourceFile)
  }

  previewEquipment(
    rows: ExcelRow[],
    sourceFile: string | null = null,
  ): EquipmentImportPreview {
    return previewEquipmentImport(rows, sourceFile)
  }

  previewUnits(rows: ExcelRow[], sourceFile: string | null = null): UnitsImportPreview {
    return previewUnitsImport(rows, sourceFile)
  }

  previewFsa(
    rows: ExcelRow[],
    catalog: FsaCatalog,
    sourceFile: string | null = null,
  ): FsaImportPreview {
    return previewFsaImport(rows, catalog, sourceFile)
  }

  // ── Commit imports ────────────────────────────────────

  commitOaImport(
    preview: OaImportPreview,
    segmentKinds: OaEditionKind[],
  ): { editionIds: string[]; itemCount: number } {
    if (!preview.canCommit) {
      throw new DomainError('Импорт ОА содержит ошибки', 'IMPORT_BLOCKED')
    }
    if (segmentKinds.length !== preview.segments.length) {
      throw new DomainError(
        'Для каждой части файла укажите вид редакции (current / extension)',
        'OA_KIND_REQUIRED',
      )
    }

    // Деактивируем предыдущие активные редакции того же kind
    for (const kind of new Set(segmentKinds)) {
      for (const ed of this.db.oaEditions) {
        if (ed.kind === kind && ed.isActive) {
          ed.isActive = false
          this.audit('oa_editions', ed.id, 'deactivate', { kind })
        }
      }
    }

    const editionIds: string[] = []
    let itemCount = 0
    const now = new Date().toISOString()

    preview.segments.forEach((segment, i) => {
      const kind = segmentKinds[i]!
      const editionId = crypto.randomUUID()
      this.db.oaEditions.push({
        id: editionId,
        title:
          kind === 'current'
            ? `Действующая ОА (${preview.sourceFile ?? 'import'})`
            : `Расширяемая ОА (${preview.sourceFile ?? 'import'})`,
        kind,
        isActive: true,
        sourceFile: preview.sourceFile,
        loadedAt: now,
      })
      editionIds.push(editionId)
      this.audit('oa_editions', editionId, 'import', {
        kind,
        itemCount: segment.itemCount,
        sourceFile: preview.sourceFile,
      })

      for (const item of segment.items) {
        this.db.oaItems.push({
          id: crypto.randomUUID(),
          editionId,
          itemNo: item.itemNo,
          methodikText: item.methodikText,
          methodikFgisId: item.methodikFgisId,
          methodText: item.methodText,
          methodFgisId: item.methodFgisId,
          objectType: item.objectType,
          indicatorText: item.indicatorText,
          indicatorFgisId: item.indicatorFgisId,
          unitText: item.unitText,
          unitFgisId: item.unitFgisId,
          rangeText: item.rangeText,
          rangeMin: item.rangeMin,
          rangeMax: item.rangeMax,
          isCalculated: item.isCalculated,
          objectName: item.objectName,
          deletedAt: null,
        })
        itemCount += 1
      }
    })

    // Старые oa_item_id в protocol_results / form_indicator_map не трогаем
    this.audit('oa_items', null, 'import_batch', {
      editionIds,
      itemCount,
      preservedLinks: true,
    })

    return { editionIds, itemCount }
  }

  commitStaffImport(preview: StaffImportPreview): { created: number; updated: number } {
    if (!preview.canCommit) {
      throw new DomainError('Импорт персонала содержит ошибки', 'IMPORT_BLOCKED')
    }
    let created = 0
    let updated = 0

    for (const row of preview.rows) {
      const existing = row.fgisIdFullName
        ? this.db.staff.find(
            (s) =>
              s.deletedAt === null && s.fgisIdFullName === row.fgisIdFullName,
          )
        : this.db.staff.find(
            (s) =>
              s.deletedAt === null &&
              s.surname.toLowerCase() === row.surname.toLowerCase() &&
              !s.authUserId,
          )

      if (existing) {
        const before = { ...existing }
        existing.fullName = row.fullName
        existing.shortName = row.shortName
        existing.surname = row.surname
        existing.fgisIdFullName = row.fgisIdFullName
        existing.postName = row.postName
        existing.fgisRoleIds = row.fgisRoleIds
        updated += 1
        this.audit('staff', existing.id, 'import_update', { before, after: existing })
      } else {
        const staff: Staff = {
          id: crypto.randomUUID(),
          authUserId: null,
          fullName: row.fullName,
          shortName: row.shortName,
          surname: row.surname,
          fgisIdFullName: row.fgisIdFullName,
          postName: row.postName,
          fgisRoleIds: row.fgisRoleIds,
          appRole: AppRole.engineer,
          isActive: true,
          deletedAt: null,
        }
        this.db.staff.push(staff)
        created += 1
        this.audit('staff', staff.id, 'import_create', { row })
      }
    }

    return { created, updated }
  }

  commitEquipmentImport(
    preview: EquipmentImportPreview,
  ): { created: number; updated: number } {
    if (!preview.canCommit) {
      throw new DomainError('Импорт оборудования содержит ошибки', 'IMPORT_BLOCKED')
    }
    let created = 0
    let updated = 0

    for (const row of preview.rows) {
      const existing =
        (row.fgisEquipmentId != null &&
          this.db.equipment.find(
            (e) =>
              e.deletedAt === null && e.fgisEquipmentId === row.fgisEquipmentId,
          )) ||
        (row.serialNorm &&
          this.db.equipment.find(
            (e) => e.deletedAt === null && e.serialNorm === row.serialNorm,
          )) ||
        null

      if (existing) {
        existing.name = row.name
        existing.serialNo = row.serialNo
        existing.serialNorm = row.serialNorm
        existing.invNo = row.invNo
        existing.fgisEquipmentId = row.fgisEquipmentId
        existing.kind = row.kind
        updated += 1
        this.audit('equipment', existing.id, 'import_update', { row })
      } else {
        const equipment: Equipment = {
          id: crypto.randomUUID(),
          name: row.name,
          serialNo: row.serialNo,
          serialNorm: row.serialNorm,
          invNo: row.invNo,
          fgisEquipmentId: row.fgisEquipmentId,
          kind: row.kind,
          isActive: true,
          deletedAt: null,
        }
        this.db.equipment.push(equipment)
        created += 1
        this.audit('equipment', equipment.id, 'import_create', { row })
      }
    }

    return { created, updated }
  }

  commitUnitsImport(preview: UnitsImportPreview): { upserted: number } {
    if (!preview.canCommit) {
      throw new DomainError('Импорт единиц содержит ошибки', 'IMPORT_BLOCKED')
    }
    let upserted = 0
    for (const row of preview.rows) {
      const existing = this.db.units.find((u) => u.fgisId === row.fgisId)
      if (existing) {
        existing.name = row.name
        existing.symbol = row.symbol
        this.audit('units', null, 'import_update', { fgisId: row.fgisId })
      } else {
        this.db.units.push({
          fgisId: row.fgisId,
          name: row.name,
          symbol: row.symbol,
        })
        this.audit('units', null, 'import_create', { fgisId: row.fgisId })
      }
      upserted += 1
    }
    return { upserted }
  }

  commitFsaImport(preview: FsaImportPreview): { upserted: number } {
    if (!preview.canCommit) {
      throw new DomainError('Импорт ФСА содержит ошибки', 'IMPORT_BLOCKED')
    }
    let upserted = 0
    for (const row of preview.rows) {
      const idx = this.db.fsaEntries.findIndex(
        (e) => e.catalog === row.catalog && e.id === row.id,
      )
      const entry: FsaEntry = {
        id: row.id,
        name: row.name,
        isActual: row.isActual,
        catalog: row.catalog,
      }
      if (idx >= 0) this.db.fsaEntries[idx] = entry
      else this.db.fsaEntries.push(entry)
      upserted += 1
    }
    this.audit('fsa', null, 'import', {
      catalog: preview.catalog,
      upserted,
    })
    return { upserted }
  }

  // ── Customers ─────────────────────────────────────────

  findCustomerByName(name: string): Customer | null {
    const key = normalizeCustomerName(name)
    return (
      this.db.customers.find((c) => {
        if (c.deletedAt) return false
        if (normalizeCustomerName(c.name) === key) return true
        return c.nameAliases.some((a) => normalizeCustomerName(a) === key)
      }) ?? null
    )
  }

  upsertCustomer(input: {
    name: string
    nameAliases?: string[]
    kindId?: CustomerKind
    inn?: string | null
    ogrn?: string | null
    phone?: string | null
    email?: string | null
    legalAddress?: string | null
    actualAddress?: string | null
  }): Customer {
    const existing = this.findCustomerByName(input.name)
    if (existing) {
      if (
        normalizeCustomerName(existing.name) !== normalizeCustomerName(input.name) &&
        !existing.nameAliases.some(
          (a) => normalizeCustomerName(a) === normalizeCustomerName(input.name),
        )
      ) {
        existing.nameAliases = [...existing.nameAliases, input.name]
      }
      Object.assign(existing, {
        inn: input.inn ?? existing.inn,
        ogrn: input.ogrn ?? existing.ogrn,
        phone: input.phone ?? existing.phone,
        email: input.email ?? existing.email,
        legalAddress: input.legalAddress ?? existing.legalAddress,
        actualAddress: input.actualAddress ?? existing.actualAddress,
        kindId: input.kindId ?? existing.kindId,
      })
      this.audit('customers', existing.id, 'update', input)
      return { ...existing }
    }

    const customer: Customer = {
      id: crypto.randomUUID(),
      name: input.name,
      nameAliases: input.nameAliases ?? [],
      kindId: input.kindId ?? CustomerKindId.legalEntity,
      inn: input.inn ?? null,
      ogrn: input.ogrn ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      legalAddress: input.legalAddress ?? null,
      actualAddress: input.actualAddress ?? null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    }
    this.db.customers.push(customer)
    this.audit('customers', customer.id, 'create', input)
    return { ...customer }
  }

  addCustomerAlias(customerId: string, alias: string): Customer {
    const customer = this.db.customers.find(
      (c) => c.id === customerId && c.deletedAt === null,
    )
    if (!customer) notFound('Заказчик не найден')
    const key = normalizeCustomerName(alias)
    if (
      normalizeCustomerName(customer.name) !== key &&
      !customer.nameAliases.some((a) => normalizeCustomerName(a) === key)
    ) {
      customer.nameAliases = [...customer.nameAliases, alias]
      this.audit('customers', customer.id, 'add_alias', { alias })
    }
    return { ...customer }
  }

  createCustomer(input: {
    name: string
    nameAliases?: string[]
    kindId?: CustomerKind
    inn?: string | null
    ogrn?: string | null
    phone?: string | null
    email?: string | null
    legalAddress?: string | null
    actualAddress?: string | null
  }): Customer {
    const name = input.name?.trim()
    if (!name) throw new DomainError('Укажите наименование', 'REQUIRED')
    if (this.findCustomerByName(name)) {
      throw new DomainError(
        'Заказчик с таким наименованием уже есть',
        'DUPLICATE',
      )
    }
    const customer: Customer = {
      id: crypto.randomUUID(),
      name,
      nameAliases: (input.nameAliases ?? [])
        .map((a) => a.trim())
        .filter(Boolean),
      kindId: input.kindId ?? CustomerKindId.legalEntity,
      inn: input.inn?.trim() || null,
      ogrn: input.ogrn?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      legalAddress: input.legalAddress?.trim() || null,
      actualAddress: input.actualAddress?.trim() || null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    }
    this.db.customers.push(customer)
    this.audit('customers', customer.id, 'create', customer)
    return { ...customer }
  }

  updateCustomerById(
    customerId: string,
    patch: Partial<
      Pick<
        Customer,
        | 'name'
        | 'nameAliases'
        | 'inn'
        | 'ogrn'
        | 'phone'
        | 'email'
        | 'legalAddress'
        | 'actualAddress'
        | 'kindId'
      >
    >,
  ): Customer {
    const customer = this.db.customers.find(
      (c) => c.id === customerId && c.deletedAt === null,
    )
    if (!customer) notFound('Заказчик не найден')
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new DomainError('Укажите наименование', 'REQUIRED')
      const clash = this.findCustomerByName(name)
      if (clash && clash.id !== customerId) {
        throw new DomainError(
          'Заказчик с таким наименованием уже есть',
          'DUPLICATE',
        )
      }
      customer.name = name
    }
    if (patch.nameAliases !== undefined) {
      customer.nameAliases = patch.nameAliases
        .map((a) => a.trim())
        .filter(Boolean)
    }
    if (patch.inn !== undefined) customer.inn = patch.inn
    if (patch.ogrn !== undefined) customer.ogrn = patch.ogrn
    if (patch.phone !== undefined) customer.phone = patch.phone
    if (patch.email !== undefined) customer.email = patch.email
    if (patch.legalAddress !== undefined) customer.legalAddress = patch.legalAddress
    if (patch.actualAddress !== undefined) {
      customer.actualAddress = patch.actualAddress
    }
    if (patch.kindId !== undefined) customer.kindId = patch.kindId
    this.audit('customers', customer.id, 'update', patch)
    return { ...customer }
  }

  softDeleteCustomer(customerId: string): void {
    const customer = this.db.customers.find(
      (c) => c.id === customerId && c.deletedAt === null,
    )
    if (!customer) notFound('Заказчик не найден')
    Object.assign(customer, softDelete(customer))
    this.audit('customers', customerId, 'soft_delete', null)
  }

  // ── Staff CRUD ────────────────────────────────────────

  createStaff(input: {
    fullName: string
    shortName?: string | null
    surname?: string | null
    fgisIdFullName?: number | null
    postName?: string | null
    fgisRoleIds?: number[]
    appRole?: Staff['appRole']
    isActive?: boolean
  }): Staff {
    const fullName = input.fullName?.trim()
    if (!fullName) {
      throw new DomainError('ФИО обязательно', 'REQUIRED')
    }
    const surname = deriveSurname(fullName, input.surname)
    const shortName =
      input.shortName?.trim() || deriveShortName(fullName, surname)
    if (!surname) {
      throw new DomainError('Не удалось определить фамилию из ФИО', 'REQUIRED')
    }
    const staff: Staff = {
      id: crypto.randomUUID(),
      authUserId: null,
      fullName,
      shortName,
      surname,
      fgisIdFullName: input.fgisIdFullName ?? null,
      postName: input.postName?.trim() || null,
      fgisRoleIds: input.fgisRoleIds?.length ? input.fgisRoleIds : [1],
      appRole: input.appRole === AppRole.head ? AppRole.head : AppRole.engineer,
      isActive: input.isActive !== false,
      deletedAt: null,
    }
    this.db.staff.push(staff)
    this.audit('staff', staff.id, 'create', staff)
    return { ...staff }
  }

  updateStaff(
    id: string,
    patch: Partial<
      Pick<
        Staff,
        | 'fullName'
        | 'shortName'
        | 'surname'
        | 'fgisIdFullName'
        | 'postName'
        | 'fgisRoleIds'
        | 'appRole'
        | 'isActive'
      >
    >,
  ): Staff {
    const staff = this.db.staff.find((s) => s.id === id && s.deletedAt === null)
    if (!staff) notFound('Сотрудник не найден')
    if (patch.fullName !== undefined) staff.fullName = patch.fullName.trim()
    if (patch.surname !== undefined) {
      staff.surname = patch.surname.trim() || deriveSurname(staff.fullName, null)
    } else if (patch.fullName !== undefined && !patch.shortName) {
      staff.surname = deriveSurname(staff.fullName, staff.surname)
    }
    if (patch.shortName !== undefined && patch.shortName.trim()) {
      staff.shortName = patch.shortName.trim()
    } else if (patch.fullName !== undefined || patch.surname !== undefined) {
      staff.shortName = deriveShortName(staff.fullName, staff.surname)
    }
    if (patch.fgisIdFullName !== undefined) staff.fgisIdFullName = patch.fgisIdFullName
    if (patch.postName !== undefined) staff.postName = patch.postName
    if (patch.fgisRoleIds !== undefined) staff.fgisRoleIds = patch.fgisRoleIds
    if (patch.appRole !== undefined) staff.appRole = patch.appRole
    if (patch.isActive !== undefined) staff.isActive = patch.isActive
    this.audit('staff', staff.id, 'update', patch)
    return { ...staff }
  }

  softDeleteStaff(id: string): void {
    const staff = this.db.staff.find((s) => s.id === id && s.deletedAt === null)
    if (!staff) notFound('Сотрудник не найден')
    Object.assign(staff, softDelete(staff))
    this.audit('staff', id, 'soft_delete', null)
  }

  // ── OA editions / items ───────────────────────────────

  createOaEdition(input: {
    title: string
    kind: OaEditionKind
    isActive?: boolean
  }): OaEdition {
    const title = input.title?.trim()
    if (!title) throw new DomainError('Название редакции обязательно', 'REQUIRED')
    if (input.kind !== 'current' && input.kind !== 'extension') {
      throw new DomainError('Некорректный тип редакции', 'INVALID')
    }
    if (input.isActive !== false) {
      for (const e of this.db.oaEditions) {
        if (e.kind === input.kind && e.isActive) e.isActive = false
      }
    }
    const edition: OaEdition = {
      id: crypto.randomUUID(),
      title,
      kind: input.kind,
      isActive: input.isActive !== false,
      sourceFile: null,
      loadedAt: new Date().toISOString(),
    }
    this.db.oaEditions.push(edition)
    this.audit('oa_editions', edition.id, 'create', edition)
    return { ...edition }
  }

  updateOaEdition(
    id: string,
    patch: Partial<Pick<OaEdition, 'title' | 'kind' | 'isActive'>>,
  ): OaEdition {
    const edition = this.db.oaEditions.find((e) => e.id === id)
    if (!edition) notFound('Редакция ОА не найдена')
    if (patch.title !== undefined) {
      const title = patch.title.trim()
      if (!title) throw new DomainError('Название редакции обязательно', 'REQUIRED')
      edition.title = title
    }
    if (patch.kind !== undefined) edition.kind = patch.kind
    if (patch.isActive !== undefined) {
      if (patch.isActive) {
        for (const e of this.db.oaEditions) {
          if (e.id !== id && e.kind === (patch.kind ?? edition.kind) && e.isActive) {
            e.isActive = false
          }
        }
      }
      edition.isActive = patch.isActive
    }
    this.audit('oa_editions', edition.id, 'update', patch)
    return { ...edition }
  }

  /** Деактивация редакции; позиции и ссылки протоколов сохраняются. */
  deactivateOaEdition(id: string): void {
    const edition = this.db.oaEditions.find((e) => e.id === id)
    if (!edition) notFound('Редакция ОА не найдена')
    edition.isActive = false
    this.audit('oa_editions', id, 'deactivate', null)
  }

  createOaItem(input: {
    editionId: string
    itemNo: string
    methodikText: string
    indicatorText: string
    methodText?: string | null
    objectType?: string | null
    unitText?: string | null
    rangeText?: string | null
    methodikFgisId?: number | null
    methodFgisId?: number | null
    indicatorFgisId?: string | null
    unitFgisId?: string | null
    rangeMin?: number | null
    rangeMax?: number | null
    isCalculated?: boolean
    objectName?: string | null
  }): OaItem {
    const edition = this.db.oaEditions.find((e) => e.id === input.editionId)
    if (!edition) notFound('Редакция ОА не найдена')
    const itemNo = input.itemNo?.trim()
    const methodikText = input.methodikText?.trim()
    const indicatorText = input.indicatorText?.trim()
    if (!itemNo || !methodikText || !indicatorText) {
      throw new DomainError(
        'Пункт, методика и показатель обязательны',
        'REQUIRED',
      )
    }
    const item: OaItem = {
      id: crypto.randomUUID(),
      editionId: input.editionId,
      itemNo,
      methodikText,
      methodikFgisId: input.methodikFgisId ?? null,
      methodText: input.methodText?.trim() || null,
      methodFgisId: input.methodFgisId ?? null,
      objectType: input.objectType?.trim() || null,
      indicatorText,
      indicatorFgisId: input.indicatorFgisId?.trim() || null,
      unitText: input.unitText?.trim() || null,
      unitFgisId: input.unitFgisId?.trim() || null,
      rangeText: input.rangeText?.trim() || null,
      rangeMin: input.rangeMin ?? null,
      rangeMax: input.rangeMax ?? null,
      isCalculated: Boolean(input.isCalculated),
      objectName: input.objectName?.trim() || null,
      deletedAt: null,
    }
    this.db.oaItems.push(item)
    this.audit('oa_items', item.id, 'create', item)
    return { ...item }
  }

  updateOaItem(
    id: string,
    patch: Partial<
      Pick<
        OaItem,
        | 'itemNo'
        | 'methodikText'
        | 'methodText'
        | 'objectType'
        | 'indicatorText'
        | 'unitText'
        | 'rangeText'
        | 'methodikFgisId'
        | 'methodFgisId'
        | 'indicatorFgisId'
        | 'unitFgisId'
        | 'rangeMin'
        | 'rangeMax'
        | 'isCalculated'
        | 'objectName'
        | 'editionId'
      >
    >,
  ): OaItem {
    const item = this.db.oaItems.find((i) => i.id === id && i.deletedAt === null)
    if (!item) notFound('Позиция ОА не найдена')
    if (patch.editionId !== undefined) {
      const edition = this.db.oaEditions.find((e) => e.id === patch.editionId)
      if (!edition) notFound('Редакция ОА не найдена')
      item.editionId = patch.editionId
    }
    if (patch.itemNo !== undefined) item.itemNo = patch.itemNo.trim()
    if (patch.methodikText !== undefined) item.methodikText = patch.methodikText.trim()
    if (patch.methodText !== undefined) item.methodText = patch.methodText
    if (patch.objectType !== undefined) item.objectType = patch.objectType
    if (patch.indicatorText !== undefined) {
      item.indicatorText = patch.indicatorText.trim()
    }
    if (patch.unitText !== undefined) item.unitText = patch.unitText
    if (patch.rangeText !== undefined) item.rangeText = patch.rangeText
    if (patch.methodikFgisId !== undefined) item.methodikFgisId = patch.methodikFgisId
    if (patch.methodFgisId !== undefined) item.methodFgisId = patch.methodFgisId
    if (patch.indicatorFgisId !== undefined) {
      item.indicatorFgisId = patch.indicatorFgisId
    }
    if (patch.unitFgisId !== undefined) item.unitFgisId = patch.unitFgisId
    if (patch.rangeMin !== undefined) item.rangeMin = patch.rangeMin
    if (patch.rangeMax !== undefined) item.rangeMax = patch.rangeMax
    if (patch.isCalculated !== undefined) item.isCalculated = patch.isCalculated
    if (patch.objectName !== undefined) item.objectName = patch.objectName
    this.audit('oa_items', item.id, 'update', patch)
    return { ...item }
  }

  softDeleteOaItem(id: string): void {
    const item = this.db.oaItems.find((i) => i.id === id && i.deletedAt === null)
    if (!item) notFound('Позиция ОА не найдена')
    Object.assign(item, softDelete(item))
    this.audit('oa_items', id, 'soft_delete', null)
  }

  // ── Equipment / verifications ─────────────────────────

  createEquipment(input: {
    name: string
    kind: EquipmentKind
    serialNo?: string | null
    invNo?: string | null
    fgisEquipmentId?: number | null
    isActive?: boolean
  }): Equipment {
    const name = input.name?.trim()
    if (!name) throw new DomainError('Наименование обязательно', 'REQUIRED')
    if (input.kind !== 'si' && input.kind !== 'aux' && input.kind !== 'test') {
      throw new DomainError('Некорректный тип оборудования', 'INVALID')
    }
    const serialNo = input.serialNo?.trim() || null
    const equipment: Equipment = {
      id: crypto.randomUUID(),
      name,
      serialNo,
      serialNorm: serialNo ? normalizeSerial(serialNo) : null,
      invNo: input.invNo?.trim() || null,
      fgisEquipmentId: input.fgisEquipmentId ?? null,
      kind: input.kind,
      isActive: input.isActive !== false,
      deletedAt: null,
    }
    this.db.equipment.push(equipment)
    this.audit('equipment', equipment.id, 'create', equipment)
    return { ...equipment }
  }

  updateEquipment(
    id: string,
    patch: Partial<
      Pick<Equipment, 'name' | 'serialNo' | 'invNo' | 'fgisEquipmentId' | 'kind' | 'isActive'>
    >,
  ): Equipment {
    const equipment = this.db.equipment.find((e) => e.id === id && e.deletedAt === null)
    if (!equipment) notFound('Оборудование не найдено')
    if (patch.serialNo !== undefined) {
      equipment.serialNo = patch.serialNo
      equipment.serialNorm = patch.serialNo ? normalizeSerial(patch.serialNo) : null
    }
    if (patch.name !== undefined) equipment.name = patch.name
    if (patch.invNo !== undefined) equipment.invNo = patch.invNo
    if (patch.fgisEquipmentId !== undefined) {
      equipment.fgisEquipmentId = patch.fgisEquipmentId
    }
    if (patch.kind !== undefined) equipment.kind = patch.kind as EquipmentKind
    if (patch.isActive !== undefined) equipment.isActive = patch.isActive
    this.audit('equipment', equipment.id, 'update', patch)
    return { ...equipment }
  }

  softDeleteEquipment(id: string): void {
    const equipment = this.db.equipment.find((e) => e.id === id && e.deletedAt === null)
    if (!equipment) notFound('Оборудование не найдено')
    Object.assign(equipment, softDelete(equipment))
    this.audit('equipment', id, 'soft_delete', null)
  }

  addVerification(input: {
    equipmentId: string
    certNo: string
    verifiedOn: string | null
    validUntil: string
  }): EquipmentVerification {
    const equipment = this.db.equipment.find(
      (e) => e.id === input.equipmentId && e.deletedAt === null,
    )
    if (!equipment) notFound('Оборудование не найдено')
    if (!input.certNo.trim()) {
      throw new DomainError('Номер свидетельства обязателен', 'REQUIRED')
    }
    if (!input.validUntil) {
      throw new DomainError('Срок действия поверки обязателен', 'REQUIRED')
    }
    const verification: EquipmentVerification = {
      id: crypto.randomUUID(),
      equipmentId: input.equipmentId,
      certNo: input.certNo.trim(),
      verifiedOn: input.verifiedOn,
      validUntil: input.validUntil,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    }
    this.db.equipmentVerifications.push(verification)
    this.audit('equipment_verifications', verification.id, 'create', input)
    return { ...verification }
  }

  updateVerification(
    id: string,
    patch: {
      equipmentId?: string
      certNo?: string
      verifiedOn?: string | null
      validUntil?: string
    },
  ): EquipmentVerification {
    const v = this.db.equipmentVerifications.find(
      (x) => x.id === id && x.deletedAt === null,
    )
    if (!v) notFound('Поверка не найдена')
    if (patch.equipmentId !== undefined) {
      const equipment = this.db.equipment.find(
        (e) => e.id === patch.equipmentId && e.deletedAt === null,
      )
      if (!equipment) notFound('Оборудование не найдено')
      v.equipmentId = patch.equipmentId
    }
    if (patch.certNo !== undefined) {
      const certNo = patch.certNo.trim()
      if (!certNo) {
        throw new DomainError('Номер свидетельства обязателен', 'REQUIRED')
      }
      v.certNo = certNo
    }
    if (patch.validUntil !== undefined) {
      if (!patch.validUntil) {
        throw new DomainError('Срок действия поверки обязателен', 'REQUIRED')
      }
      v.validUntil = patch.validUntil
    }
    if (patch.verifiedOn !== undefined) v.verifiedOn = patch.verifiedOn
    this.audit('equipment_verifications', id, 'update', patch)
    return { ...v }
  }

  softDeleteVerification(id: string): void {
    const v = this.db.equipmentVerifications.find((x) => x.id === id)
    if (!v || v.deletedAt) notFound('Поверка не найдена')
    Object.assign(v, softDelete(v))
    this.audit('equipment_verifications', id, 'soft_delete', null)
  }

  // ── Units / conversions ───────────────────────────────

  upsertUnit(unit: Unit): Unit {
    if (!unit.fgisId || !unit.symbol) {
      throw new DomainError('ID и обозначение единицы обязательны', 'REQUIRED')
    }
    const existing = this.db.units.find((u) => u.fgisId === unit.fgisId)
    if (existing) {
      existing.name = unit.name
      existing.symbol = unit.symbol
      this.audit('units', null, 'update', unit)
      return { ...existing }
    }
    this.db.units.push({ ...unit })
    this.audit('units', null, 'create', unit)
    return { ...unit }
  }

  upsertUnitConversion(conv: UnitConversion): UnitConversion {
    if (!conv.fromSymbol || !conv.toSymbol || !(conv.factor > 0)) {
      throw new DomainError('Некорректный пересчёт единиц', 'INVALID')
    }
    const idx = this.db.unitConversions.findIndex(
      (c) => c.fromSymbol === conv.fromSymbol && c.toSymbol === conv.toSymbol,
    )
    if (idx >= 0) {
      this.db.unitConversions[idx] = { ...conv }
      this.audit('unit_conversions', null, 'update', conv)
    } else {
      this.db.unitConversions.push({ ...conv })
      this.audit('unit_conversions', null, 'create', conv)
    }
    return { ...conv }
  }

  deleteUnit(fgisId: string): void {
    const idx = this.db.units.findIndex((u) => u.fgisId === fgisId)
    if (idx < 0) notFound('Единица не найдена')
    const [removed] = this.db.units.splice(idx, 1)
    this.audit('units', null, 'delete', removed ?? { fgisId })
  }

  deleteUnitConversion(fromSymbol: string, toSymbol: string): void {
    const idx = this.db.unitConversions.findIndex(
      (c) => c.fromSymbol === fromSymbol && c.toSymbol === toSymbol,
    )
    if (idx < 0) notFound('Пересчёт не найден')
    const [removed] = this.db.unitConversions.splice(idx, 1)
    this.audit('unit_conversions', null, 'delete', removed ?? { fromSymbol, toSymbol })
  }

  // ── Forms / indicator maps ────────────────────────────

  updateProtocolForm(
    formId: string,
    patch: Partial<
      Pick<
        ProtocolForm,
        | 'status'
        | 'parserProfile'
        | 'typeObjectId'
        | 'fgisDirectory'
        | 'conditionsLimits'
        | 'settings'
        | 'title'
      >
    >,
  ): ProtocolForm {
    const form = this.db.protocolForms.find((f) => f.id === formId)
    if (!form) notFound('Форма не найдена')
    if (patch.status !== undefined) form.status = patch.status as FormStatus
    if (patch.parserProfile !== undefined) form.parserProfile = patch.parserProfile
    if (patch.typeObjectId !== undefined) form.typeObjectId = patch.typeObjectId
    if (patch.fgisDirectory !== undefined) form.fgisDirectory = patch.fgisDirectory
    if (patch.conditionsLimits !== undefined) {
      form.conditionsLimits = patch.conditionsLimits
    }
    if (patch.settings !== undefined) form.settings = patch.settings
    if (patch.title !== undefined) form.title = patch.title
    this.audit('protocol_forms', form.id, 'update', patch)
    return { ...form }
  }

  upsertFormIndicatorMap(input: {
    formId: string
    sourceKey: string
    oaItemId: string
    ub: FormIndicatorMap['ub']
  }): FormIndicatorMap {
    const form = this.db.protocolForms.find((f) => f.id === input.formId)
    if (!form) notFound('Форма не найдена')
    const oa = this.db.oaItems.find((i) => i.id === input.oaItemId)
    if (!oa) notFound('Позиция ОА не найдена')

    const existing = this.db.formIndicatorMaps.find(
      (m) => m.formId === input.formId && m.sourceKey === input.sourceKey,
    )
    if (existing) {
      existing.oaItemId = input.oaItemId
      existing.ub = input.ub
      this.audit('form_indicator_map', existing.id, 'update', input)
      return { ...existing }
    }
    const map: FormIndicatorMap = {
      id: crypto.randomUUID(),
      formId: input.formId,
      sourceKey: input.sourceKey,
      oaItemId: input.oaItemId,
      ub: input.ub,
    }
    this.db.formIndicatorMaps.push(map)
    this.audit('form_indicator_map', map.id, 'create', input)
    return { ...map }
  }

  // ── Settings ──────────────────────────────────────────

  writeSetting(key: string, value: unknown): Setting {
    const existing = this.db.settings.find((s) => s.key === key)
    if (existing) {
      const before = existing.value
      existing.value = value
      this.audit('settings', key, 'update', { key, before, after: value })
      return { ...existing }
    }
    const created = { key, value }
    this.db.settings.push(created)
    this.audit('settings', key, 'create', { key, before: null, after: value })
    return created
  }
}
