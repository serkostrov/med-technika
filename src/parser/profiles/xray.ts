import { normalizeText } from '@/dictionaries/normalize/text'
import { formatFactValue } from '../fact-value'
import {
  HEADER_MAX_COL,
  cellText,
  colIndex,
  getCell,
  isRowHidden,
  type SheetGrid,
} from '../sheet-utils'
import type { ParsedObject, ParsedResult } from '../types'

/**
 * Профиль xray (26-ЭП — периодические испытания рентгеновских аппаратов).
 *
 * Протокол — последовательность разделов с заголовком в A; у раздела своя таблица.
 * Раздел описан правилом «заголовок → как достать значения»; какая позиция ОА ему
 * соответствует — form_indicator_map формы (у разных листов один раздел может уходить
 * в разные показатели). Порядок во ФГИС — порядок разделов, внутри раздела — слева
 * направо (эталоны 426, 412, 385, 386, 403, 408, 414-26-ЭП). Скрытый раздел и «-» / НП
 * не выгружаются. Правее AO — подсказки и расчёты шаблона.
 */

const COL_C = colIndex('C')
const COL_D = colIndex('D')
const COL_LIMIT = colIndex('AO') // значения в таблицах — левее подсказок

type Emit = (key: string, r: number, c: number, unit: string | null) => void
type Parse = (g: SheetGrid, from: number, to: number, emit: Emit) => void

function norm(s: string): string {
  return normalizeText(s).toLowerCase()
}

/** «…, пар лин./мм.» → «пар лин./мм», «…, шт.» → «шт» (точка в конце — пунктуация ячейки) */
function unitAfterComma(text: string): string | null {
  const parts = normalizeText(text).split(',').map((p) => p.trim())
  const u = parts.length >= 2 ? parts[parts.length - 1]!.replace(/\.$/, '').trim() : ''
  return u || null
}

function hasValue(g: SheetGrid, r: number, c: number): boolean {
  const cell = getCell(g, r, c)
  if (!cell || cell.v == null || cell.t === 'e') return false
  if (typeof cell.v === 'number') return true
  const t = normalizeText(String(cell.v))
  return !!t && t !== '-' && t !== '—' && !/^нп$|^нк$/i.test(t)
}

/** Ячейки со значениями (числа или текст вроде «≥ 3,6») левее подсказок, с колонки from. */
function valueCols(g: SheetGrid, r: number, from: number, numericOnly = false): number[] {
  const cols: number[] = []
  for (let c = from; c < COL_LIMIT; c++) {
    if (numericOnly ? typeof getCell(g, r, c)?.v === 'number' : hasValue(g, r, c)) cols.push(c)
  }
  return cols
}

/** Видимая строка раздела, где в колонке col метка начинается с prefix. */
function findRow(g: SheetGrid, from: number, to: number, prefix: string, col = COL_D): number | null {
  for (let r = from; r <= to; r++) {
    if (isRowHidden(g, r)) continue
    if (norm(cellText(g, r, col)).startsWith(prefix)) return r
  }
  return null
}

/** Строка с меткой в D или в A (маммограф: метки в A). */
function findLabel(g: SheetGrid, from: number, to: number, prefix: string): number | null {
  for (let r = from; r <= to; r++) {
    if (isRowHidden(g, r)) continue
    if (norm(cellText(g, r, COL_D)).startsWith(prefix) || norm(cellText(g, r, 0)).startsWith(prefix)) {
      return r
    }
  }
  return null
}

/** Первая ячейка (левее подсказок) в строках раздела с текстом, начинающимся с prefix. */
function findCell(g: SheetGrid, from: number, to: number, prefix: string): [number, number] | null {
  for (let r = from; r <= to; r++) {
    if (isRowHidden(g, r)) continue
    for (let c = 0; c < COL_LIMIT; c++) {
      if (norm(cellText(g, r, c)).startsWith(prefix)) return [r, c]
    }
  }
  return null
}

/** «Результаты измерения» → строка с меткой в D («U, кВ», «t, с», «Q, мАс») → значения. */
/** «Результаты измерения» — в A или в D (403-26-ЭП). */
function resultsStart(g: SheetGrid, from: number, to: number): number | null {
  const a = findRow(g, from, to, 'результат', 0)
  const d = findRow(g, from, to, 'результат')
  if (a == null) return d
  if (d == null) return a
  return Math.min(a, d)
}

function resultRow(key: string, label: string, unit: string): Parse {
  return (g, from, to, emit) => {
    const res = resultsStart(g, from, to)
    const r = res != null ? findLabel(g, res, to, label) : null
    if (r == null) return
    for (const c of valueCols(g, r, COL_D + 1, true)) emit(key, r, c, unit)
  }
}

/** Отдельный раздел «… (отклонение, %)»: значения — в следующей видимой строке. */
function deviationSection(key: string): Parse {
  return (g, from, to, emit) => {
    for (let r = from; r <= to; r++) {
      if (isRowHidden(g, r)) continue
      const cols = valueCols(g, r, COL_D + 1, true)
      if (cols.length) {
        for (const c of cols) emit(key, r, c, '%')
        return
      }
    }
  }
}

/** Строка «Рассчитанное значение …» / «Коэффициент отклонения» в D — все числа строки. */
function calcRow(key: string, firstOnly = false): Parse {
  return (g, from, to, emit) => {
    const r =
      findLabel(g, from, to, 'рассчитанное значение') ??
      findLabel(g, from, to, 'коэффициент отклонения') ??
      findLabel(g, from, to, 'коэффициент вариации')
    if (r == null) return
    const cols = valueCols(g, r, COL_D + 1, true)
    for (const c of firstOnly ? cols.slice(0, 1) : cols) emit(key, r, c, null)
  }
}

/** Значение под заголовком колонки (header — начало текста заголовка). */
function underHeader(key: string, header: string): Parse {
  return (g, from, to, emit) => {
    const at = findCell(g, from, to, header)
    if (!at) return
    const [r, c] = at
    if (hasValue(g, r + 1, c)) emit(key, r + 1, c, unitAfterComma(cellText(g, r, c)))
  }
}

/**
 * «Регистрация …, <ед.>» / «Пороговый контраст, %»: значение в той же строке правее
 * (385-26-ЭП) или в той же колонке ниже, в строке Р/М (426-26-ЭП).
 */
function registration(key: string): Parse {
  return (g, from, to, emit) => {
    const at = findCell(g, from, to, 'регистрация') ?? findCell(g, from, to, 'пороговый контраст')
    if (!at) {
      // КТ (419-26-ЭП): «Результаты определения», ниже — число в A и единица правее
      const res = findRow(g, from, to, 'результат', 0)
      if (res == null || typeof getCell(g, res + 1, 0)?.v !== 'number') return
      let unit: string | null = null
      for (let c = 1; c < COL_LIMIT && !unit; c++) unit = normalizeText(cellText(g, res + 1, c)) || null
      emit(key, res + 1, 0, unit)
      return
    }
    const [r, c] = at
    const unit = unitAfterComma(cellText(g, r, c))
    const inRow = valueCols(g, r, c + 1, true)[0]
    if (inRow != null) {
      emit(key, r, inRow, unit)
      return
    }
    for (let rr = r + 1; rr <= to; rr++) {
      if (!isRowHidden(g, rr) && typeof getCell(g, rr, c)?.v === 'number') {
        emit(key, rr, c, unit)
        return
      }
    }
  }
}

/** «Результат определения[, <ед.>]» в A и число в следующей строке. */
function nextRowResult(key: string): Parse {
  return (g, from, to, emit) => {
    const r = findRow(g, from, to, 'результат определения', 0)
    if (r == null) return
    const unit = unitAfterComma(cellText(g, r, 0))
    const c = valueCols(g, r + 1, 0, true)[0]
    if (c != null) emit(key, r + 1, c, unit)
  }
}

/** Под каждой меткой (A начинается с label) — число в A следующей строки (КТ: шум, CTDIvol, DLP). */
/** unit: 'label' — после запятой в подписи; null — без единицы (DLP: «указание не требуется»). */
function belowLabels(key: string, label: string, unit: string | null | 'label' = 'label'): Parse {
  return (g, from, to, emit) => {
    for (let r = from; r < to; r++) {
      if (isRowHidden(g, r) || !norm(cellText(g, r, 0)).startsWith(label)) continue
      if (typeof getCell(g, r + 1, 0)?.v === 'number') {
        emit(key, r + 1, 0, unit === 'label' ? unitAfterComma(cellText(g, r, 0)) : unit)
      }
    }
  }
}

/** Строки с меткой в A — все числа строки правее (КТ: однородность по 5 областям). */
function labelRows(key: string, label: string, unit: string | null): Parse {
  return (g, from, to, emit) => {
    for (let r = from; r <= to; r++) {
      if (isRowHidden(g, r) || !norm(cellText(g, r, 0)).startsWith(label)) continue
      for (const c of valueCols(g, r, 1, true)) emit(key, r, c, unit)
    }
  }
}

const SECTIONS: { title: string; parse: Parse }[] = [
  {
    // одна или несколько сигнализаций (световая / звуковая) — все «наличие / отсутствие»
    title: 'индикация нагрузочного состояния',
    parse: (g, from, to, emit) => {
      // световая и звуковая — разные позиции ОА (методики ГОСТ Р 50267.2.54 / ГОСТ Р МЭК
      // 60601-1-3, эталон 414-26-ЭП): вид — по подписи колонки выше значения
      for (let r = from; r <= to; r++) {
        if (isRowHidden(g, r)) continue
        for (let c = 0; c < COL_LIMIT; c++) {
          if (!/^(наличие|отсутствие)$/.test(norm(cellText(g, r, c)))) continue
          let sound = false
          for (let up = r - 1; up >= from && !sound; up--) {
            if (norm(cellText(g, up, c)).startsWith('звуков')) sound = true
          }
          emit(sound ? 'load_indication_sound' : 'load_indication', r, c, null)
        }
      }
    },
  },
  {
    // КТ (419-26-ЭП): «Результат определения: наличие»
    title: 'индикация состояния нагрузки',
    parse: (g, from, to, emit) => {
      const r = findRow(g, from, to, 'результат определения', 0)
      if (r == null) return
      const c = valueCols(g, r, 1)[0]
      if (c != null) emit('load_indication', r, c, null)
    },
  },
  { title: 'фильтрация рентгеновского излучения', parse: underHeader('total_filtration', 'общая') },
  {
    title: 'слой половинного ослабления',
    parse: (g, from, to, emit) => {
      for (const col of [COL_C, 0]) {
        const r = findRow(g, from, to, 'слой половинного ослабления,', col)
        if (r != null && hasValue(g, r + 1, col)) {
          emit('hvl', r + 1, col, unitAfterComma(cellText(g, r, col)))
          return
        }
      }
      // КТ: таблица «U, кВ | Слой половинного ослабления, мм Al» — по строке на напряжение
      const at = findCell(g, from, to, 'слой половинного ослабления,')
      if (!at) return
      const [hr, hc] = at
      const unit = unitAfterComma(cellText(g, hr, hc))
      for (let r = hr + 1; r <= to && typeof getCell(g, r, hc)?.v === 'number'; r++) {
        if (!isRowHidden(g, r)) emit('hvl', r, hc, unit)
      }
    },
  },
  // «(отклонение, %)» — отдельным разделом; раньше базового заголовка (startsWith)
  { title: 'точность анодного напряжения (отклонение', parse: deviationSection('kv_accuracy') },
  {
    title: 'точность анодного напряжения',
    parse: (g, from, to, emit) => {
      resultRow('kv', 'u, кв', 'кВ')(g, from, to, emit)
      // 426-26-ЭП (дентальный): отклонение — строкой «Отклонение, %» внутри раздела
      const dev = findRow(g, from, to, 'отклонение', 0)
      if (dev != null) {
        const row = valueCols(g, dev, COL_D + 1, true).length ? dev : dev + 1
        for (const c of valueCols(g, row, COL_D + 1, true)) emit('kv_accuracy', row, c, '%')
      }
    },
  },
  { title: 'точность времени нагрузки (отклонение', parse: deviationSection('load_time_accuracy') },
  { title: 'точность времени нагрузки', parse: resultRow('load_time', 't, с', 'с') },
  { title: 'точность времени облучения (отклонение', parse: deviationSection('irradiation_time_accuracy') },
  { title: 'точность времени облучения', parse: resultRow('irradiation_time', 't, с', 'с') },
  {
    // 426-26-ЭП: по установленному U — оба времени, затем оба отклонения
    title: 'точность поддержания времени облучения',
    parse: (g, from, to, emit) => {
      const setU = findRow(g, from, to, 'u, кв')
      const res = findRow(g, from, to, 'результаты', 0)
      const t = res != null ? findRow(g, res, to, 't, с') : null
      const dev = findRow(g, from, to, 'отклонение', 0)
      if (t == null) return
      const groups = new Map<string, number[]>()
      for (const c of valueCols(g, t, COL_D + 1, true)) {
        const k = setU != null ? cellText(g, setU, c) : ''
        groups.set(k, [...(groups.get(k) ?? []), c])
      }
      for (const group of groups.values()) {
        for (const c of group) emit('exposure_time', t, c, 'с')
        if (dev != null) for (const c of group) emit('exposure_accuracy', dev + 1, c, '%')
      }
    },
  },
  { title: 'точность произведения ток-время (отклонение', parse: deviationSection('mas_accuracy') },
  { title: 'точность произведения ток-время', parse: resultRow('mas', 'q, мас', 'мАс') },
  { title: 'воспроизводимость переданной кермы', parse: calcRow('kerma_reproducibility', true) },
  { title: 'воспроизводимость радиационного выхода', parse: calcRow('output_reproducibility', true) },
  { title: 'линейность переданной кермы', parse: calcRow('kerma_linearity') },
  // маммограф 408-26-ЭП: коэффициент вариации по всем режимам
  { title: 'воспроизводимость выхода рентгеновского', parse: calcRow('output_variation') },
  {
    // маммограф: видимые шарики (шт.) у левого / правого края, затем «соответствует»
    title: 'соответствие светового поля',
    parse: (g, from, to, emit) => {
      const head = findCell(g, from, to, 'видимые шарики')
      const unit = head ? unitAfterComma(cellText(g, head[0], head[1])) : null
      for (let r = from; r <= to; r++) {
        if (isRowHidden(g, r)) continue
        for (let c = 0; c < COL_LIMIT; c++) {
          const cell = getCell(g, r, c)
          if (typeof cell?.v === 'number') emit('light_field_match', r, c, unit)
          else if (/^(соответствует|не соответствует)$/.test(norm(cellText(g, r, c)))) {
            emit('light_field_match', r, c, null)
          }
        }
      }
    },
  },
  { title: 'линейность воздушной кермы', parse: calcRow('air_kerma_linearity') },
  {
    // расхождения по осям a1 / a2 / b1 / b2 (мм) — колонки под «ось …», без «± U»
    title: 'совпадения радиационного и светового',
    parse: (g, from, to, emit) => {
      const head = findCell(g, from, to, 'ось')
      if (!head) return
      const [hr] = head
      const axes: number[] = []
      for (let c = 0; c < COL_LIMIT; c++) if (norm(cellText(g, hr, c)).startsWith('ось')) axes.push(c)
      for (let r = hr + 1; r <= to; r++) {
        if (isRowHidden(g, r)) continue
        if (!axes.some((c) => hasValue(g, r, c))) continue
        for (const c of axes) if (hasValue(g, r, c)) emit('field_alignment', r, c, 'мм')
      }
    },
  },
  {
    title: 'квантовая эффективность регистрации',
    parse: (g, from, to, emit) => {
      const r = findRow(g, from, to, 'результат определения', 0)
      if (r == null) return
      for (const rr of [r, r + 1]) {
        const c = valueCols(g, rr, rr === r ? 1 : 0, true)[0]
        if (c != null) {
          emit('dqe', rr, c, null)
          return
        }
      }
    },
  },
  {
    title: 'радиационный выход',
    parse: (g, from, to, emit) => {
      const at = findCell(g, from, to, 'радиационный выход,')
      if (!at) return
      const [r, c] = at
      const unit = unitAfterComma(cellText(g, r, c))
      for (let rr = r + 1; rr <= to; rr++) {
        if (!isRowHidden(g, rr) && typeof getCell(g, rr, c)?.v === 'number') emit('radiation_output', rr, c, unit)
      }
    },
  },
  {
    title: 'излучение утечки в нагрузочном состоянии',
    parse: (g, from, to, emit) => {
      const res = findRow(g, from, to, 'результаты', 0)
      const r = res != null ? findLabel(g, res, to, "d'") : null
      if (r == null) return
      const c = valueCols(g, r, COL_D + 1, true)[0]
      const label = norm(cellText(g, r, COL_D)).startsWith("d'") ? cellText(g, r, COL_D) : cellText(g, r, 0)
      if (c != null) emit('leakage', r, c, unitAfterComma(label))
    },
  },
  {
    title: 'дозиметрические индикации',
    parse: (g, from, to, emit) => {
      const r = findRow(g, from, to, 'результат определения', 0)
      if (r == null) return
      for (let c = 1; c < COL_LIMIT; c++) {
        if (hasValue(g, r, c)) {
          emit('dose_indication', r, c, null)
          return
        }
      }
    },
  },
  { title: 'пространственное разрешение', parse: registration('spatial_resolution') },
  // маммограф: «Результат определения» и значение строкой ниже (часто НП)
  { title: 'высококонтрастная разрешающая', parse: nextRowResult('high_contrast_resolution') },
  { title: 'контрастная чувствительность', parse: nextRowResult('contrast_sensitivity') },
  { title: 'низкоконтрастное разрешение', parse: registration('low_contrast') },
  // ── КТ (419-26-ЭП «КТ периодич») ──
  // точность установки U у КТ во ФГИС не выгружалась (эталон 419-26-ЭП)
  { title: 'точность установки анодного напряжения', parse: () => {} },
  { title: 'шум', parse: belowLabels('ct_noise', 'среднее квадратическое отклонение', 'HU') },
  { title: 'среднее число кт-единиц', parse: belowLabels('ct_mean', 'среднее число кт-единиц', 'HU') },
  { title: 'однородность', parse: labelRows('ct_uniformity', 'определяемые значения', 'HU') },
  {
    title: 'томографическая толщина слоя',
    parse: (g, from, to, emit) => {
      for (let r = from; r <= to; r++) {
        if (isRowHidden(g, r) || !/^(верхняя|нижняя)$/.test(norm(cellText(g, r, 0)))) continue
        const c = valueCols(g, r, 1, true)[0]
        if (c != null) emit('ct_slice_thickness', r, c, 'мм')
      }
    },
  },
  { title: 'объемный компьютерно-томографический индекс', parse: belowLabels('ctdi_vol', 'результаты определения') },
  { title: 'произведение дозы на длину сканирования', parse: belowLabels('dlp', 'результаты определения', null) },
  {
    // продольное позиционирование: колонки «Продольное направлени… Lвперёд / Lназад, мм»
    title: 'позиционирование стола пациента',
    parse: (g, from, to, emit) => {
      const head = findCell(g, from, to, 'установленное расстояние')
      if (!head) return
      const [hr] = head
      const cols: number[] = []
      for (let c = 1; c < COL_LIMIT; c++) if (norm(cellText(g, hr, c)).startsWith('продольное')) cols.push(c)
      for (let r = hr + 1; r <= to; r++) {
        if (isRowHidden(g, r)) continue
        for (const c of cols) if (typeof getCell(g, r, c)?.v === 'number') emit('table_positioning', r, c, 'мм')
      }
    },
  },
]

function sectionAt(g: SheetGrid, r: number) {
  const a = norm(cellText(g, r, 0))
  if (!a) return null
  // «Слой половинного ослабления, мм Al» — заголовок колонки, не раздела (маммограф)
  // КТ: «среднее число КТ-единиц в центральной области…, Нu» — подпись результата
  if (/^[^,(]+,\s*(мм|кв|мгр|%|с(?![а-яё])|[нh]u)/.test(a)) return null
  return SECTIONS.find((s) => a.startsWith(s.title)) ?? null
}

function isProtocolEnd(text: string): boolean {
  const n = norm(text)
  return (
    n.startsWith('результаты измерений относятся') ||
    n.startsWith('протокол оформил') ||
    n.startsWith('мнение и толкование')
  )
}

/** Объект испытаний из шапки: «Объект испытаний: …», заводской номер, год выпуска. */
function headerObject(grid: SheetGrid): ParsedObject | null {
  for (let r = 0; r <= Math.min(grid.maxRow, 60); r++) {
    if (!norm(cellText(grid, r, 0)).startsWith('объект испытаний')) continue
    let name: string | null = null
    for (let c = 1; c <= HEADER_MAX_COL && !name; c++) {
      const t = normalizeText(cellText(grid, r, c))
      if (t) name = t
    }
    let serial: string | null = null
    let year: string | null = null
    for (let rr = r + 1; rr <= r + 5; rr++) {
      for (let c = 1; c <= HEADER_MAX_COL; c++) {
        const label = norm(cellText(grid, rr, c))
        if (label.startsWith('заводской номер')) {
          for (let c2 = c + 1; c2 <= HEADER_MAX_COL && !serial; c2++) {
            serial = normalizeText(cellText(grid, rr, c2)) || null
          }
        } else if (label.startsWith('год выпуска')) {
          for (let c2 = c + 1; c2 <= HEADER_MAX_COL && !year; c2++) {
            const t = normalizeText(cellText(grid, rr, c2))
            if (/^\d{4}$/.test(t)) year = t
          }
        }
      }
    }
    return { seq: 1, name, serialNo: serial, year, department: null }
  }
  return null
}

export function parseXray(grid: SheetGrid): {
  objects: ParsedObject[]
  results: ParsedResult[]
  log: string[]
} {
  const log: string[] = []
  const object = headerObject(grid)
  const objects: ParsedObject[] = object ? [object] : []
  const results: ParsedResult[] = []

  // границы разделов: заголовок раздела → следующий заголовок / конец протокола
  const starts: { row: number; section: (typeof SECTIONS)[number] }[] = []
  let end = grid.maxRow
  for (let r = 0; r <= grid.maxRow; r++) {
    if (isProtocolEnd(cellText(grid, r, 0))) {
      end = r - 1
      break
    }
    const section = sectionAt(grid, r)
    if (section) starts.push({ row: r, section })
  }

  const emit: Emit = (key, r, c, unit) => {
    const cell = getCell(grid, r, c)
    if (!cell || cell.v == null || cell.v === '') return
    let fact: string
    let num: number | null = null
    if (typeof cell.v === 'number' && cell.t !== 'e') {
      num = cell.v
      fact = formatFactValue(cell.v, cell.z && cell.z !== 'General' ? cell.z : 'General')
    } else {
      fact = normalizeText(String(cell.v))
      if (!fact || fact === '-' || fact === '—') return
    }
    results.push({
      seq: results.length + 1,
      objectSeq: object ? 1 : null,
      sourceKey: key,
      indicatorRaw: normalizeText(cellText(grid, r, COL_D)) || key,
      unitSymbol: unit,
      setValue: null,
      rawValues: null,
      avgExcel: num,
      uExcel: null,
      ubExcel: null,
      avgCalc: null,
      uCalc: null,
      numberFormat: cell.z ?? null,
      factValue: fact,
      displayValue: num,
    })
  }

  starts.forEach((s, i) => {
    if (isRowHidden(grid, s.row)) {
      log.push(`xray: раздел «${s.section.title}» скрыт — не выгружается`)
      return
    }
    const to = i + 1 < starts.length ? starts[i + 1]!.row - 1 : end
    const before = results.length
    s.section.parse(grid, s.row + 1, to, emit)
    if (results.length === before) log.push(`xray: раздел «${s.section.title}» — значений нет (НП/НК)`)
  })

  log.push(`xray: разделов ${starts.length}, результатов ${results.length}`)
  return { objects, results, log }
}
