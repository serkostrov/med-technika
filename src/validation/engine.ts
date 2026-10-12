import {
  CustomerKindId,
  EquipmentKind,
  IssueSeverity,
  OaEditionKind,
  ProtocolStatus,
  type Protocol,
} from '@/domain'
import type { Database } from '@/server/db/database'
import { parseOaRange } from '@/dictionaries/normalize/fgis-text'
import { canConvert, tryConvert } from '@/dictionaries/units/convert'
import { parseFactValueNumber } from '@/validation/fact-value'
import {
  exceedsRecalcTolerance,
  getRecalcTolerance,
  recalcMeanAndU,
} from '@/validation/recalc'
import {
  applyFindings,
  type CheckCode,
  type CheckFinding,
} from './checks/types'

const ACTIVE_FOR_DICT_RERUN: ReadonlySet<string> = new Set([
  ProtocolStatus.review,
  ProtocolStatus.approved,
  ProtocolStatus.ready,
])

/**
 * protocol_run_checks(p_id) — полный набор E01–E15, W01–W03, W05–W07 (ТЗ §8).
 */
export function protocolRunChecks(
  db: Database,
  protocolId: string,
  options?: { now?: string },
): CheckFinding[] {
  const protocol = db.protocols.find(
    (p) => p.id === protocolId && p.deletedAt === null,
  )
  if (!protocol) return []

  const now = options?.now ?? new Date().toISOString()
  const findings: CheckFinding[] = []
  const add = (
    code: CheckCode,
    defaultSeverity: 'error' | 'warning',
    message: string,
    ref?: Record<string, unknown> | null,
  ) => {
    findings.push({
      code,
      defaultSeverity:
        defaultSeverity === 'error' ? IssueSeverity.error : IssueSeverity.warning,
      message,
      ref: ref ?? null,
    })
  }

  const results = db.protocolResults.filter((r) => r.protocolId === protocolId)
  const equipment = db.protocolEquipment.filter(
    (e) => e.protocolId === protocolId,
  )
  const objects = db.protocolObjects.filter((o) => o.protocolId === protocolId)
  const form = db.protocolForms.find((f) => f.id === protocol.formId)
  const customer = protocol.customerId
    ? db.customers.find((c) => c.id === protocol.customerId)
    : null
  const engineer = protocol.engineerStaffId
    ? db.staff.find((s) => s.id === protocol.engineerStaffId)
    : null
  const tolerance = getRecalcTolerance(db.settings)
  const today = now.slice(0, 10)

  // ── E01: обязательные поля ────────────────────────────
  if (!protocol.number?.trim() || !protocol.protocolDate) {
    add('E01', 'error', 'Пустой номер или дата протокола', {
      fields: ['number', 'protocolDate'],
    })
  }
  if (!protocol.measureStart || !protocol.measureEnd) {
    add('E01', 'error', 'Не заполнены даты измерений', {
      fields: ['measureStart', 'measureEnd'],
    })
  }
  if (!protocol.objectFullName?.trim()) {
    add('E01', 'error', 'Не заполнен объект (FullNameObject)', {
      fields: ['objectFullName'],
    })
  }
  if (!protocol.customerId) {
    add('E01', 'error', 'Заказчик не сопоставлен', { fields: ['customerId'] })
  }
  if (!protocol.measureAddress?.trim()) {
    add('E01', 'error', 'Не заполнен адрес места измерений', {
      fields: ['measureAddress'],
    })
  }
  if (results.length === 0) {
    add('E01', 'error', 'Нет результатов', { tab: 'results' })
  }
  if (equipment.length === 0) {
    add('E01', 'error', 'Нет оборудования', { tab: 'equipment' })
  }
  if (!protocol.engineerStaffId) {
    add('E01', 'error', 'Исполнитель не указан', {
      fields: ['engineerStaffId'],
    })
  }

  // ── E06: исполнитель + idFullName ─────────────────────
  if (protocol.engineerStaffId) {
    if (!engineer || engineer.deletedAt) {
      add('E06', 'error', 'Исполнитель не найден в справочнике', {
        fields: ['engineerStaffId'],
      })
    } else if (engineer.fgisIdFullName == null) {
      add('E06', 'error', 'Исполнитель без idFullName (ФЛК 4)', {
        fields: ['engineerStaffId'],
      })
    }
  }

  // ── E07 / E08 / E09 / E11: даты ───────────────────────
  const pDate = protocol.protocolDate
  const mStart = protocol.measureStart
  const mEnd = protocol.measureEnd

  if (mStart && pDate && mStart > pDate) {
    add('E07', 'error', 'Дата начала измерений позже даты протокола (ФЛК 1)', {
      fields: ['measureStart', 'protocolDate'],
      measureStart: mStart,
      protocolDate: pDate,
    })
  }
  if (mEnd && pDate && mEnd > pDate) {
    add('E07', 'error', 'Дата окончания измерений позже даты протокола (ФЛК 1)', {
      fields: ['measureEnd', 'protocolDate'],
      measureEnd: mEnd,
      protocolDate: pDate,
    })
  }
  if (mStart && mEnd && mEnd < mStart) {
    add('E08', 'error', 'Окончание измерений раньше начала (ФЛК 2)', {
      fields: ['measureStart', 'measureEnd'],
      measureStart: mStart,
      measureEnd: mEnd,
    })
  }
  if (
    protocol.applicationDate &&
    pDate &&
    protocol.applicationDate > pDate
  ) {
    add('E09', 'error', 'Дата заявки позже даты протокола (ФЛК 3)', {
      fields: ['applicationDate', 'protocolDate'],
      applicationDate: protocol.applicationDate,
      protocolDate: pDate,
    })
  }
  if (pDate && pDate > today) {
    add('E11', 'error', 'Дата протокола позже текущей (ФЛК 15)', {
      fields: ['protocolDate'],
      protocolDate: pDate,
      today,
    })
  }

  // ── E10: повтор номера + даты ─────────────────────────
  if (protocol.number && protocol.protocolDate) {
    const dup = db.protocols.find(
      (p) =>
        p.id !== protocol.id &&
        p.deletedAt === null &&
        p.number === protocol.number &&
        p.protocolDate === protocol.protocolDate,
    )
    if (dup) {
      add('E10', 'error', 'Номер и дата уже есть у другого протокола (ФЛК 5)', {
        otherProtocolId: dup.id,
      })
    }
  }

  // ── E04 / E05 / W03: оборудование ─────────────────────
  for (const pe of equipment) {
    if (!pe.equipmentId) {
      add('E04', 'error', `СИ/оборудование не найдено: ${pe.rawText ?? pe.seq}`, {
        seq: pe.seq,
      })
      continue
    }
    const eq = db.equipment.find((e) => e.id === pe.equipmentId)
    if (!eq || eq.deletedAt) {
      add('E04', 'error', `СИ/оборудование не найдено: ${pe.rawText ?? pe.seq}`, {
        seq: pe.seq,
        equipmentId: pe.equipmentId,
      })
      continue
    }
    if (eq.fgisEquipmentId == null) {
      add('E04', 'error', 'Оборудование без EquipmentId (ФЛК 4)', {
        equipmentId: eq.id,
        seq: pe.seq,
      })
    }

    const kind = pe.kind ?? eq.kind
    if (kind === EquipmentKind.si && mStart && mEnd) {
      const vers = db.equipmentVerifications.filter(
        (v) =>
          v.equipmentId === eq.id &&
          v.deletedAt === null &&
          v.validUntil >= mEnd &&
          (v.verifiedOn == null || v.verifiedOn <= mStart),
      )
      if (vers.length === 0) {
        add(
          'E05',
          'error',
          'Поверка СИ не действует на период измерений',
          { equipmentId: eq.id, seq: pe.seq },
        )
      } else if (pe.certRaw || pe.validUntilRaw) {
        const match = vers.some(
          (v) =>
            (!pe.certRaw || v.certNo === pe.certRaw) &&
            (!pe.validUntilRaw || v.validUntil === pe.validUntilRaw),
        )
        if (!match) {
          add(
            'W03',
            'warning',
            'Свидетельство или срок поверки в протоколе не совпадают со справочником',
            { equipmentId: eq.id, seq: pe.seq },
          )
        }
      }
    }
  }

  // ── E13 / E14: заказчик ───────────────────────────────
  if (customer && !customer.deletedAt) {
    if (
      (customer.kindId === CustomerKindId.legalEntity ||
        customer.kindId === CustomerKindId.soleProprietor) &&
      !customer.inn?.trim() &&
      !customer.ogrn?.trim()
    ) {
      add('E13', 'error', 'У заказчика нет ни ИНН, ни ОГРН (ФЛК 11/12)', {
        fields: ['customerId'],
        customerId: customer.id,
      })
    }
    const hasContact =
      !!customer.phone?.trim() ||
      !!customer.email?.trim() ||
      !!customer.legalAddress?.trim() ||
      !!customer.actualAddress?.trim() ||
      !!protocol.customerPhone?.trim()
    if (!hasContact) {
      add('E14', 'error', 'Нет контакта заказчика (телефон, email или адрес)', {
        fields: ['customerId'],
        customerId: customer.id,
      })
    }
  }

  // ── W01: условия измерений ────────────────────────────
  if (form?.conditionsLimits && protocol.conditions) {
    const lim = form.conditionsLimits
    const c = protocol.conditions as {
      t?: number
      rh?: number
      p?: number
      verdict?: string
    }
    const out: string[] = []
    if (lim.t && c.t != null && !(c.t > lim.t[0]! && c.t < lim.t[1]!)) {
      out.push(`t=${c.t}`)
    }
    if (lim.rh && c.rh != null && !(c.rh > lim.rh[0]! && c.rh < lim.rh[1]!)) {
      out.push(`RH=${c.rh}`)
    }
    if (lim.p && c.p != null && !(c.p > lim.p[0]! && c.p < lim.p[1]!)) {
      out.push(`P=${c.p}`)
    }
    if (out.length > 0) {
      add(
        'W01',
        'warning',
        `Условия измерений вне пределов формы: ${out.join(', ')}`,
        { tab: 'summary' },
      )
    }
    if (
      typeof c.verdict === 'string' &&
      /не\s*соответств/i.test(c.verdict)
    ) {
      add('W01', 'warning', `Вердикт шаблона: ${c.verdict}`, {
        tab: 'summary',
      })
    }
  }

  // ── W05: несколько пар напряжения ────────────────────
  const voltages = (
    protocol.conditions as { voltages?: unknown[] } | null
  )?.voltages
  if (Array.isArray(voltages) && voltages.length > 1) {
    add(
      'W05',
      'warning',
      `Несколько пар «напряжение сети» (${voltages.length}) — возможны строки от прошлого протокола`,
      { tab: 'summary' },
    )
  }

  // ── W06: год выпуска объекта ──────────────────────────
  for (const obj of objects) {
    if (!obj.year?.trim()) {
      add('W06', 'warning', `У объекта не указан год выпуска: ${obj.name ?? obj.seq}`, {
        objectId: obj.id,
      })
    }
  }

  // ── Результаты: E02, E03, E12, E15, W02, W07 ─────────
  for (const result of results) {
    if (!result.oaItemId) {
      add('E03', 'error', `Результат не сопоставлен с ОА: ${result.sourceKey}`, {
        resultId: result.id,
      })
      continue
    }

    const oa = db.oaItems.find((i) => i.id === result.oaItemId)
    if (!oa || oa.deletedAt) {
      add('E03', 'error', `Позиция ОА не найдена: ${result.sourceKey}`, {
        resultId: result.id,
        oaItemId: result.oaItemId,
      })
      continue
    }

    const edition = db.oaEditions.find((e) => e.id === oa.editionId)
    if (
      edition?.kind === OaEditionKind.extension &&
      !protocol.accredScope353
    ) {
      add(
        'E12',
        'error',
        `Позиция из расширяемой ОА без признака AccredScope353: ${result.sourceKey}`,
        {
          resultId: result.id,
          oaItemId: oa.id,
          fields: ['accredScope353'],
          highlight: 'oa',
        },
      )
    }

    // E15: единица
    const excelUnit = result.unitSymbol
    const oaUnit = oa.unitText
    if (excelUnit) {
      const known = db.units.some((u) => u.symbol === excelUnit)
      if (!known) {
        add('E15', 'error', `Единица не найдена в справочнике: ${excelUnit}`, {
          resultId: result.id,
        })
      } else if (oaUnit && !canConvert(excelUnit, oaUnit, db.unitConversions)) {
        add(
          'E15',
          'error',
          `Нет пересчёта ${excelUnit} → ${oaUnit}`,
          { resultId: result.id },
        )
      }
    } else if (oaUnit) {
      add('E15', 'error', `Не указана единица результата: ${result.sourceKey}`, {
        resultId: result.id,
      })
    }

    // W07 / E02: диапазон ОА
    if (!oa.isCalculated) {
      let min = oa.rangeMin
      let max = oa.rangeMax
      const rangeLooksEmpty =
        !oa.rangeText?.trim() ||
        oa.rangeText.trim() === '-' ||
        oa.rangeText.trim() === '—'

      if (min == null && max == null && oa.rangeText && !rangeLooksEmpty) {
        const parsed = parseOaRange(oa.rangeText)
        if (parsed.min == null || parsed.max == null) {
          add(
            'W07',
            'warning',
            `Диапазон ОА не распознан («${oa.rangeText}») — проверку диапазона не выполняли`,
            { resultId: result.id, oaItemId: oa.id },
          )
        } else {
          min = parsed.min
          max = parsed.max
        }
      }

      if (min != null && max != null) {
        const factNum = parseFactValueNumber(result.factValue)
        if (factNum != null) {
          let valueInOa = factNum
          if (
            excelUnit &&
            oaUnit &&
            excelUnit !== oaUnit &&
            canConvert(excelUnit, oaUnit, db.unitConversions)
          ) {
            valueInOa =
              tryConvert(factNum, excelUnit, oaUnit, db.unitConversions) ??
              factNum
          }
          if (valueInOa < min || valueInOa > max) {
            add(
              'E02',
              'error',
              `FactValue вне диапазона ОА [${min}; ${max}]: ${result.factValue}`,
              {
                resultId: result.id,
                oaItemId: oa.id,
                highlight: 'fact',
              },
            )
          }
        }
      }
    }

    // W02: сверка пересчёта с Excel
    if (result.rawValues && result.rawValues.length > 0) {
      const map = db.formIndicatorMaps.find(
        (m) =>
          m.formId === protocol.formId && m.sourceKey === result.sourceKey,
      )
      const recalc = recalcMeanAndU(result.rawValues, map?.ub ?? null)
      // хранить серверный пересчёт отдельно от Excel
      result.avgCalc = recalc.avg
      result.uCalc = recalc.U

      if (
        result.avgExcel != null &&
        exceedsRecalcTolerance(recalc.avg, result.avgExcel, tolerance)
      ) {
        add(
          'W02',
          'warning',
          `Расхождение среднего с Excel: calc=${recalc.avg}, excel=${result.avgExcel}`,
          { resultId: result.id },
        )
      }
      if (
        result.uExcel != null &&
        exceedsRecalcTolerance(recalc.U, result.uExcel, tolerance)
      ) {
        add(
          'W02',
          'warning',
          `Расхождение U с Excel: calc=${recalc.U}, excel=${result.uExcel}`,
          { resultId: result.id },
        )
      }
    }
  }

  applyFindings(db, protocolId, findings, now)
  return findings
}

/** Перезапуск проверок для протоколов в review/approved/ready. */
export function rerunChecksForActiveProtocols(db: Database): number {
  let n = 0
  for (const p of db.protocols) {
    if (p.deletedAt) continue
    if (!ACTIVE_FOR_DICT_RERUN.has(p.status)) continue
    protocolRunChecks(db, p.id)
    n += 1
  }
  return n
}

export function isProtocolActiveForChecks(protocol: Protocol): boolean {
  return ACTIVE_FOR_DICT_RERUN.has(protocol.status)
}
