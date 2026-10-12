import type { FormIndicatorMap } from '@/domain'
import type { Database } from '@/server/db/database'

export type ConfirmIndicatorInput = {
  formId: string
  sourceKey: string
  oaItemId: string
  ub: FormIndicatorMap['ub']
}

/**
 * Пользователь один раз подтверждает связь показатель→ОА —
 * сохраняется в form_indicator_map и используется автоматически (ТЗ §6.4).
 */
export function confirmIndicatorMapping(
  db: Database,
  input: ConfirmIndicatorInput,
): FormIndicatorMap {
  const existing = db.formIndicatorMaps.find(
    (m) => m.formId === input.formId && m.sourceKey === input.sourceKey,
  )

  if (existing) {
    existing.oaItemId = input.oaItemId
    existing.ub = input.ub
    return existing
  }

  const row: FormIndicatorMap = {
    id: crypto.randomUUID(),
    formId: input.formId,
    sourceKey: input.sourceKey,
    oaItemId: input.oaItemId,
    ub: input.ub,
  }
  db.formIndicatorMaps.push(row)
  return row
}

/** Применить карту к результатам протокола (после подтверждения / смены ОА). */
export function applyIndicatorMapsToProtocol(
  db: Database,
  protocolId: string,
): void {
  const protocol = db.protocols.find((p) => p.id === protocolId)
  if (!protocol) return

  for (const result of db.protocolResults.filter(
    (r) => r.protocolId === protocolId,
  )) {
    const map = db.formIndicatorMaps.find(
      (m) => m.formId === protocol.formId && m.sourceKey === result.sourceKey,
    )
    if (map) {
      result.oaItemId = map.oaItemId
    }
  }
}
