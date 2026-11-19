import { FormStatus } from '@/domain'
import type { Database } from '@/server/db/database'
import { SEED_PROTOCOL_FORMS } from './protocol-forms'
import { SEED_UNITS } from './units'
import { SEED_FORM_INDICATOR_MAPS, SEED_OA_ITEMS } from './oa'
import { SeedIds } from '@/data/ids'

/**
 * Формы, убранные из seed: «Дети_» 26-ЭД обычный / расширенный — приложения
 * (ИЛ 16.11.2026). Удаляем из БД, только если на них нет протоколов.
 */
const RETIRED_FORM_IDS = new Set([
  '33333333-3333-4333-8333-0000000001a1', // stableFormId(4, 7)
  '33333333-3333-4333-8333-0000000001bd', // stableFormId(4, 20 + 15)
])

/**
 * Досинхронизация справочников из кода в уже существующую БД.
 *
 * Справочники попадают в БД один раз — при создании. Когда в коде появляется
 * новая готовая форма (материалы + профиль), сохранённая БД (Postgres / IndexedDB /
 * резервная копия) о ней не знает. Здесь только безопасные изменения:
 * — форма повышается до seed-статуса, только если в БД она всё ещё no_materials
 *   (её никто не включал и не настраивал руками);
 * — единицы, позиции ОА и сопоставления добавляются, если их нет; существующие
 *   записи не трогаем.
 *
 * Возвращает true, если что-то изменилось.
 */
type OaItemPatch = Partial<Pick<Database['oaItems'][number], 'unitText' | 'unitFgisId'>>

const OA_ITEM_FIXES: { id: string; from: OaItemPatch; to: OaItemPatch }[] = [
  {
    // 26-ЭП «Маммограф» light_field_match: единица по эталону 408-26-ЭП (19.11.2026)
    id: SeedIds.oaItemEp062,
    from: { unitText: 'шт.', unitFgisId: '133' },
    to: { unitText: 'соответствует/не соответствует', unitFgisId: '0' },
  },
]

export function syncSeedReferenceData(db: Database): boolean {
  let changed = false

  const before = db.protocolForms.length
  db.protocolForms = db.protocolForms.filter(
    (f) => !RETIRED_FORM_IDS.has(f.id) || db.protocols.some((p) => p.formId === f.id),
  )
  if (db.protocolForms.length !== before) changed = true

  for (const seed of SEED_PROTOCOL_FORMS) {
    const form = db.protocolForms.find((f) => f.id === seed.id)
    if (!form) {
      db.protocolForms.push(structuredClone(seed))
      changed = true
      continue
    }
    if (
      form.status === FormStatus.no_materials &&
      seed.status !== FormStatus.no_materials
    ) {
      form.status = seed.status
      // имя листа/заголовок тоже из кода: форму могли разделить (26-МК МИ / ГОСТ / БВЕК)
      form.sheetName = seed.sheetName
      form.title = seed.title
      form.templateFile = seed.templateFile
      form.parserProfile = seed.parserProfile
      form.typeObjectId = seed.typeObjectId
      form.fgisDirectory = seed.fgisDirectory
      form.conditionsLimits = structuredClone(seed.conditionsLimits)
      form.settings = { ...structuredClone(seed.settings), ...form.settings }
      changed = true
    }
  }

  for (const seed of SEED_UNITS) {
    const exists = db.units.some(
      (u) => u.fgisId === seed.fgisId || u.symbol === seed.symbol,
    )
    if (!exists) {
      db.units.push({ ...seed })
      changed = true
    }
  }

  const editionIds = new Set(db.oaEditions.map((e) => e.id))
  for (const seed of SEED_OA_ITEMS) {
    if (!editionIds.has(seed.editionId)) continue
    if (db.oaItems.some((i) => i.id === seed.id)) continue
    db.oaItems.push(structuredClone(seed))
    changed = true
  }

  // исправления seed-позиций ОА: только если позиция не правилась вручную (старые значения)
  for (const fix of OA_ITEM_FIXES) {
    const item = db.oaItems.find((i) => i.id === fix.id)
    if (!item) continue
    const untouched = Object.entries(fix.from).every(
      ([k, v]) => item[k as keyof typeof item] === v,
    )
    if (!untouched) continue
    Object.assign(item, fix.to)
    changed = true
  }

  const oaIds = new Set(db.oaItems.map((i) => i.id))
  for (const seed of SEED_FORM_INDICATOR_MAPS) {
    if (!oaIds.has(seed.oaItemId)) continue
    const exists = db.formIndicatorMaps.some(
      (m) =>
        m.id === seed.id ||
        (m.formId === seed.formId && m.sourceKey === seed.sourceKey),
    )
    if (exists) continue
    db.formIndicatorMaps.push(structuredClone(seed))
    changed = true
  }

  return changed
}
