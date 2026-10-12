import type { FormIndicatorMap, OaItem } from '@/domain'

export type IndicatorMatch = {
  map: FormIndicatorMap | null
  oaItem: OaItem | null
  auto: boolean
}

/**
 * Показатель Excel (sourceKey) → позиция ОА через form_indicator_map.
 * Связь подтверждается один раз и далее применяется автоматически (ТЗ §6.4).
 */
export function matchIndicator(
  maps: readonly FormIndicatorMap[],
  formId: string,
  sourceKey: string,
  oaItems: readonly OaItem[],
): IndicatorMatch {
  const map =
    maps.find((m) => m.formId === formId && m.sourceKey === sourceKey) ?? null

  if (!map) {
    return { map: null, oaItem: null, auto: false }
  }

  const oaItem =
    oaItems.find((p) => p.id === map.oaItemId && p.deletedAt === null) ?? null

  return { map, oaItem, auto: true }
}
