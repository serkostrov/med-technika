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
 * Профиль xray (26-ЭП «Дентальный с визиографом и без» — периодические испытания
 * рентгеновского аппарата). Протокол — последовательность разделов с заголовком в A;
 * у каждого раздела своя таблица. Какие ячейки уходят во ФГИС и в каком порядке —
 * по эталону 426-26-ЭП. Скрытый раздел (заголовок в скрытой строке) не выгружается.
 * Правее AO — подсказки и расчёты шаблона.
 */

const COL_D = colIndex('D')
const COL_LIMIT = colIndex('AO') // значения в таблицах — левее подсказок

type Emit = (
  key: string,
  r: number,
  c: number,
  unit: string | null,
  opts?: { general?: boolean },
) => void

function norm(s: string): string {
  return normalizeText(s).toLowerCase()
}

function unitAfterComma(text: string): string | null {
  const parts = normalizeText(text).split(',').map((p) => p.trim())
  return parts.length >= 2 && parts[parts.length - 1] ? parts[parts.length - 1]! : null
}

/** Числовые ячейки строки левее подсказок шаблона, начиная с колонки from. */
function numericCols(grid: SheetGrid, r: number, from: number): number[] {
  const cols: number[] = []
  for (let c = from; c < COL_LIMIT; c++) {
    if (typeof getCell(grid, r, c)?.v === 'number') cols.push(c)
  }
  return cols
}

/** Строка раздела, где в D (или A) метка начинается с prefix. */
function findRow(
  grid: SheetGrid,
  from: number,
  to: number,
  prefix: string,
  col = COL_D,
): number | null {
  for (let r = from; r <= to; r++) {
    if (isRowHidden(grid, r)) continue
    if (norm(cellText(grid, r, col)).startsWith(prefix)) return r
  }
  return null
}

type Section = {
  title: string
  key: string
  parse: (grid: SheetGrid, from: number, to: number, emit: Emit) => void
}

/** Порядок разделов совпадает с протоколом; ключи — sourceKey для form_indicator_map. */
const SECTIONS: Section[] = [
  {
    title: 'индикация нагрузочного состояния',
    key: 'load_indication',
    parse: (g, from, to, emit) => {
      for (let r = from; r <= to; r++) {
        if (!isRowHidden(g, r) && /^(наличие|отсутствие)/.test(norm(cellText(g, r, 0)))) {
          emit('load_indication', r, 0, null)
          return
        }
      }
    },
  },
  {
    title: 'фильтрация рентгеновского излучения',
    key: 'total_filtration',
    parse: (g, from, to, emit) => {
      for (let r = from; r <= to; r++) {
        for (let c = 1; c < COL_LIMIT; c++) {
          const t = cellText(g, r, c)
          if (norm(t).startsWith('общая')) {
            const row = r + 1
            if (typeof getCell(g, row, c)?.v === 'number') {
              emit('total_filtration', row, c, unitAfterComma(t))
            }
            return
          }
        }
      }
    },
  },
  {
    title: 'слой половинного ослабления',
    key: 'hvl',
    parse: (g, from, to, emit) => {
      for (let r = from; r <= to; r++) {
        const t = cellText(g, r, colIndex('C'))
        if (norm(t).startsWith('слой половинного ослабления')) {
          if (typeof getCell(g, r + 1, colIndex('C'))?.v === 'number') {
            emit('hvl', r + 1, colIndex('C'), unitAfterComma(t))
          }
          return
        }
      }
    },
  },
  {
    title: 'точность анодного напряжения',
    key: 'kv',
    parse: (g, from, to, emit) => {
      const res = findRow(g, from, to, 'результаты', 0)
      const u = res != null ? findRow(g, res, to, 'u, кв') : null
      const dev = findRow(g, from, to, 'отклонение', 0)
      if (u == null) return
      const cols = numericCols(g, u, COL_D + 1)
      // эталон: все U, затем все отклонения
      for (const c of cols) emit('kv', u, c, 'кВ')
      if (dev != null) for (const c of cols) emit('kv_accuracy', dev + 1, c, '%')
    },
  },
  {
    title: 'точность поддержания времени облучения',
    key: 'exposure_time',
    parse: (g, from, to, emit) => {
      const setU = findRow(g, from, to, 'u, кв')
      const res = findRow(g, from, to, 'результаты', 0)
      const t = res != null ? findRow(g, res, to, 't, с') : null
      const dev = findRow(g, from, to, 'отклонение', 0)
      if (t == null) return
      const cols = numericCols(g, t, COL_D + 1)
      // эталон: по установленному U — оба времени, затем оба отклонения
      const groups = new Map<string, number[]>()
      for (const c of cols) {
        const k = setU != null ? cellText(g, setU, c) : ''
        groups.set(k, [...(groups.get(k) ?? []), c])
      }
      for (const group of groups.values()) {
        for (const c of group) emit('exposure_time', t, c, 'с')
        if (dev != null) for (const c of group) emit('exposure_accuracy', dev + 1, c, '%')
      }
    },
  },
  {
    title: 'линейность воздушной кермы',
    key: 'air_kerma_linearity',
    parse: (g, from, to, emit) => {
      const r = findRow(g, from, to, 'рассчитанное значение отклонения')
      if (r == null) return
      for (const c of numericCols(g, r, COL_D + 1)) emit('air_kerma_linearity', r, c, null)
    },
  },
  {
    title: 'воспроизводимость переданной кермы',
    key: 'kerma_reproducibility',
    parse: (g, from, to, emit) => {
      const r = findRow(g, from, to, 'коэффициент отклонения')
      if (r == null) return
      const c = numericCols(g, r, COL_D + 1)[0]
      if (c != null) emit('kerma_reproducibility', r, c, null)
    },
  },
  {
    title: 'радиационный выход',
    key: 'radiation_output',
    parse: (g, from, to, emit) => {
      for (let r = from; r <= to; r++) {
        for (let c = 1; c < COL_LIMIT; c++) {
          const t = cellText(g, r, c)
          if (!norm(t).startsWith('радиационный выход,')) continue
          const unit = unitAfterComma(t)
          for (let rr = r + 1; rr <= to; rr++) {
            if (isRowHidden(g, rr)) continue
            if (typeof getCell(g, rr, c)?.v === 'number') emit('radiation_output', rr, c, unit)
          }
          return
        }
      }
    },
  },
  {
    title: 'излучение утечки в нагрузочном состоянии',
    key: 'leakage',
    parse: (g, from, to, emit) => {
      const res = findRow(g, from, to, 'результаты', 0)
      const r = res != null ? findRow(g, res, to, "d'") : null
      if (r == null) return
      const c = numericCols(g, r, COL_D + 1)[0]
      // эталон «0,0576» при формате ячейки 0.00000 — без хвостовых нулей
      if (c != null) emit('leakage', r, c, unitAfterComma(cellText(g, r, COL_D)), { general: true })
    },
  },
  {
    title: 'дозиметрические индикации',
    key: 'dose_indication',
    parse: (g, from, to, emit) => {
      const r = findRow(g, from, to, 'результат определения', 0)
      if (r == null) return
      for (let c = 1; c < COL_LIMIT; c++) {
        if (cellText(g, r, c)) {
          emit('dose_indication', r, c, null)
          return
        }
      }
    },
  },
  {
    title: 'пространственное разрешение',
    key: 'spatial_resolution',
    parse: (g, from, to, emit) => resolutionSection(g, from, to, emit, 'spatial_resolution'),
  },
  {
    title: 'низкоконтрастное разрешение',
    key: 'low_contrast',
    parse: (g, from, to, emit) => resolutionSection(g, from, to, emit, 'low_contrast'),
  },
]

/** «Регистрация …, пар лин./мм» в заголовке; значение — в той же колонке в строке Р/М. */
function resolutionSection(g: SheetGrid, from: number, to: number, emit: Emit, key: string) {
  for (let r = from; r <= to; r++) {
    for (let c = 1; c < COL_LIMIT; c++) {
      const t = cellText(g, r, c)
      if (!norm(t).startsWith('регистрация')) continue
      const unit = unitAfterComma(t)
      for (let rr = r + 1; rr <= to; rr++) {
        if (!isRowHidden(g, rr) && typeof getCell(g, rr, c)?.v === 'number') {
          emit(key, rr, c, unit)
          return
        }
      }
      return
    }
  }
}

function sectionAt(grid: SheetGrid, r: number): Section | null {
  const a = norm(cellText(grid, r, 0))
  if (!a) return null
  return SECTIONS.find((s) => a.startsWith(s.title)) ?? null
}

function isProtocolEnd(text: string): boolean {
  const n = norm(text)
  return n.startsWith('результаты измерений относятся') || n.startsWith('протокол оформил')
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
  const starts: { row: number; section: Section }[] = []
  let end = grid.maxRow
  for (let r = 0; r <= grid.maxRow; r++) {
    if (isProtocolEnd(cellText(grid, r, 0))) {
      end = r - 1
      break
    }
    const section = sectionAt(grid, r)
    if (section) starts.push({ row: r, section })
  }

  const emit: Emit = (key, r, c, unit, opts) => {
    const cell = getCell(grid, r, c)
    if (!cell || cell.v == null || cell.v === '') return
    let fact: string
    let num: number | null = null
    if (typeof cell.v === 'number') {
      num = cell.v
      const z = opts?.general ? 'General' : cell.z && cell.z !== 'General' ? cell.z : 'General'
      fact = formatFactValue(cell.v, z)
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
