import * as XLSX from 'xlsx'
import { setCell } from '@/parser/workbook'
import { COL, encodeCell } from '@/parser/sheet-utils'

function bookWithSheet(name: string): {
  wb: XLSX.WorkBook
  sheet: XLSX.WorkSheet
} {
  const sheet: XLSX.WorkSheet = {}
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, name)
  return { wb, sheet }
}

function finalize(sheet: XLSX.WorkSheet, maxR: number, maxC: number): void {
  sheet['!ref'] = `A1:${encodeCell(maxR, maxC)}`
}

function toBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  if (out instanceof ArrayBuffer) return out
  if (out instanceof Uint8Array) {
    const copy = new Uint8Array(out.byteLength)
    copy.set(out)
    return copy.buffer
  }
  return Uint8Array.from(out as number[]).buffer
}

type BbRow = {
  name?: string
  serial?: string
  year?: string
  setValue: string
  display: number
  format: string
  raw: [number, number, number, number]
  avg: number
  U: number
}

function writePhysioBbSheet(
  sheetName: string,
  meta: {
    number: string
    date: string
    objectName: string
    customer: string
    legalAddress: string
    phone: string
    place: string
    address: string
    measureDate: string
    engineer: string
  },
  blocks: { indicator: string; rows: BbRow[] }[],
  siLines: string[],
): ArrayBuffer {
  const { wb, sheet } = bookWithSheet(sheetName)
  let r = 0
  setCell(sheet, r++, 0, `Протокол № ${meta.number} от ${meta.date} г.`)
  setCell(sheet, r, 0, 'Наименование объекта:')
  setCell(sheet, r++, 15, meta.objectName)
  setCell(sheet, r, 0, 'Наименование заказчика:')
  setCell(sheet, r++, 15, meta.customer)
  setCell(sheet, r, 0, 'Юридический адрес заказчика:')
  setCell(sheet, r++, 15, meta.legalAddress)
  setCell(sheet, r, 0, 'Контактные данные заказчика:')
  setCell(sheet, r++, 15, `телефон ${meta.phone}`)
  setCell(sheet, r, 0, 'Место проведения измерений:')
  setCell(sheet, r++, 15, meta.place)
  setCell(sheet, r++, 15, meta.address)
  setCell(sheet, r, 0, 'Дата проведения измерений:')
  setCell(sheet, r++, 15, meta.measureDate)
  setCell(sheet, r++, 0, 'Средства измерений:')
  siLines.forEach((line, i) => setCell(sheet, r++, 0, `${i + 1}) ${line}`))
  setCell(sheet, r++, 0, 'Вспомогательное оборудование:')
  setCell(sheet, r++, 0, '1) Стойка, зав.№ ST-1')
  setCell(sheet, r, 0, 'температура воздуха:')
  setCell(sheet, r++, 15, '22')
  setCell(sheet, r, 0, 'отн. влажность:')
  setCell(sheet, r++, 15, '45')
  setCell(sheet, r, 0, 'атмосферное давление:')
  setCell(sheet, r++, 15, '99')

  for (const block of blocks) {
    setCell(sheet, r, COL.A, '№')
    setCell(sheet, r, COL.AC, block.indicator)
    r++
    for (const row of block.rows) {
      if (row.name) {
        setCell(sheet, r, COL.C, row.name)
        setCell(sheet, r, COL.S, row.serial ?? '')
        setCell(sheet, r, COL.Y, row.year ?? '')
      }
      setCell(sheet, r, COL.AC, row.setValue)
      setCell(sheet, r, COL.AK, row.display, row.format)
      setCell(sheet, r, COL.BB, row.raw[0])
      setCell(sheet, r, COL.BC, row.raw[1])
      setCell(sheet, r, COL.BD, row.raw[2])
      setCell(sheet, r, COL.BE, row.raw[3])
      setCell(sheet, r, COL.BF, row.avg)
      setCell(sheet, r, COL.BJ, row.U)
      r++
    }
  }

  setCell(sheet, r, 0, 'Протокол оформил:')
  setCell(sheet, r, 20, meta.engineer)
  finalize(sheet, r + 2, COL.BJ)
  return toBuffer(wb)
}

/** Эталон 20-26-УВЧ — 9 результатов (ТЗ App. A). */
export function buildReferenceUhfXlsx(): ArrayBuffer {
  const powerRows: BbRow[] = [
    {
      name: 'УВЧ-30',
      serial: '001',
      year: '2018',
      setValue: '80±24',
      display: 63.27,
      format: '0.0',
      raw: [63.2, 63.3, 63.3, 63.3],
      avg: 63.275,
      U: 0.1,
    },
    {
      setValue: '100',
      display: 87.4,
      format: '0.0',
      raw: [87.4, 87.4, 87.4, 87.4],
      avg: 87.4,
      U: 0.1,
    },
    {
      name: 'Аппарат-2',
      serial: '002',
      year: '2019',
      setValue: '30',
      display: 21.1,
      format: '0.0',
      raw: [21.1, 21.1, 21.1, 21.1],
      avg: 21.1,
      U: 0.1,
    },
    {
      name: 'Аппарат-3',
      serial: '003',
      year: '2020',
      setValue: '15±4,5',
      display: 6.952500000000001,
      format: '0.0',
      raw: [6.95, 6.95, 6.95, 6.96],
      avg: 6.9525,
      U: 0.1,
    },
    {
      setValue: '30±9',
      display: 14.5,
      format: '0.0',
      raw: [14.5, 14.5, 14.5, 14.5],
      avg: 14.5,
      U: 0.1,
    },
  ]
  const freqRows: BbRow[] = [
    {
      name: 'УВЧ-30',
      serial: '001',
      year: '2018',
      setValue: '27',
      display: 27.13025,
      format: '0.000',
      raw: [27.13, 27.13, 27.13, 27.131],
      avg: 27.13025,
      U: 0.001,
    },
    {
      name: 'Аппарат-2',
      serial: '002',
      year: '2019',
      setValue: '27',
      display: 27.22,
      format: '0.000',
      raw: [27.22, 27.22, 27.22, 27.22],
      avg: 27.22,
      U: 0.001,
    },
    {
      name: 'Аппарат-3',
      serial: '003',
      year: '2020',
      setValue: '27',
      display: 27.686999999999998,
      format: '0.000',
      raw: [27.687, 27.687, 27.687, 27.687],
      avg: 27.687,
      U: 0.001,
    },
    {
      name: 'Аппарат-4',
      serial: '004',
      year: '2021',
      setValue: '40',
      display: 40.563,
      format: '0.000',
      raw: [40.563, 40.563, 40.563, 40.563],
      avg: 40.563,
      U: 0.001,
    },
  ]

  return writePhysioBbSheet(
    'УВЧ-терапия',
    {
      number: '20-26-УВЧ',
      date: '22.09.2026',
      objectName: 'Медицинские аппараты коротковолновой (УВЧ) терапии',
      customer: 'ООО "Эталон-Мед"',
      legalAddress:
        '424031, Республика Марий Эл, г. Йошкар-Ола, ул Якова Эшпая, д. 113А, офис I',
      phone: '+78362380322',
      place: 'г. Советск',
      address: '613340, Кировская область, г. Cоветск, ул. Октябрьская, д. 70',
      measureDate: '18.09.2026',
      engineer: 'Судницын А.В.',
    },
    [
      { indicator: 'Выходная мощность, Вт', rows: powerRows },
      { indicator: 'Рабочая частота, МГц', rows: freqRows },
    ],
    [
      'Измеритель мощности, зав.№ 08024, свидетельство № А-1, действительна до 01.01.2027',
      'Частотомер, зав.№ 054, свидетельство № Б-2, действительна до 01.01.2027',
      'Вольтметр, зав.№ V1, свидетельство № В-3, действительна до 01.01.2027',
      'Мультиметр, зав.№ M1, свидетельство № Г-4, действительна до 01.01.2027',
    ],
  )
}

/** Эталон 44-26-МТ — 5 результатов силы тока. */
export function buildReferenceMtXlsx(): ArrayBuffer {
  const rows: BbRow[] = [
    {
      name: 'НЧ-1',
      serial: 'N1',
      year: '2017',
      setValue: '5',
      display: 5.0925,
      format: '0.00',
      raw: [5.09, 5.09, 5.1, 5.09],
      avg: 5.0925,
      U: 0.01,
    },
    {
      name: 'НЧ-2',
      serial: 'N2',
      year: '2018',
      setValue: '10',
      display: 10.34,
      format: '0.00',
      raw: [10.34, 10.34, 10.34, 10.34],
      avg: 10.34,
      U: 0.01,
    },
    {
      name: 'НЧ-3',
      serial: 'N3',
      year: '2019',
      setValue: '25',
      display: 25.13,
      format: '0.00',
      raw: [25.13, 25.13, 25.13, 25.13],
      avg: 25.13,
      U: 0.01,
    },
    {
      name: 'НЧ-4',
      serial: 'N4',
      year: '2020',
      setValue: '50',
      display: 48.83,
      format: '0.00',
      raw: [48.83, 48.83, 48.83, 48.83],
      avg: 48.83,
      U: 0.01,
    },
    {
      name: 'НЧ-5',
      serial: 'N5',
      year: '2021',
      setValue: '100',
      display: 92.465,
      format: '0.00',
      raw: [92.46, 92.47, 92.46, 92.47],
      avg: 92.465,
      U: 0.01,
    },
  ]

  return writePhysioBbSheet(
    'НЧ-терапия',
    {
      number: '44-26-МТ',
      date: '22.09.2026',
      objectName: 'Аппараты для низкочастотной терапии',
      customer: 'ООО "Эталон-мед"',
      legalAddress:
        '424031, Республика Марий Эл, г. Йошкар-Ола, ул Якова Эшпая, д. 113А, офис I',
      phone: '88362380322',
      place: 'г. Советск',
      address: '613340, Кировская область, г. Cоветск, ул. Октябрьская, д. 70',
      measureDate: '18.09.2026',
      engineer: 'Судницын А.В.',
    },
    [{ indicator: 'Сила тока, мА', rows }],
    [
      'Измеритель, зав.№ 08024, свидетельство № А-1, действительна до 01.01.2027',
      'Шунт, зав.№ S1, свидетельство № Б-2, действительна до 01.01.2027',
      'Мультиметр, зав.№ M1, свидетельство № В-3, действительна до 01.01.2027',
    ],
  )
}

/** Эталон 26-26-ДФ — 10 результатов. */
export function buildReferenceDfXlsx(): ArrayBuffer {
  const { wb, sheet } = bookWithSheet('Дефибриллятор ИЭВИ')
  let r = 0
  setCell(sheet, r++, 0, 'Протокол № 26-26-ДФ от 22.09.2026 г.')
  setCell(sheet, r, 0, 'Наименование объекта:')
  setCell(sheet, r++, 15, 'Дефибрилляторы; Дефибрилляторы-мониторы')
  setCell(sheet, r, 0, 'Наименование заказчика:')
  setCell(sheet, r++, 15, 'ООО "Эталон-Мед"')
  setCell(sheet, r, 0, 'Юридический адрес заказчика:')
  setCell(sheet, r++, 15, '424031, Республика Марий Эл, г. Йошкар-Ола')
  setCell(sheet, r, 0, 'Контактные данные заказчика:')
  setCell(sheet, r++, 15, 'телефон 88362380322')
  setCell(sheet, r, 0, 'Место проведения измерений:')
  setCell(sheet, r++, 15, 'г. Советск')
  setCell(sheet, r++, 15, '613340, Кировская область, г. Cоветск, ул. Октябрьская, д. 70')
  setCell(sheet, r, 0, 'Дата проведения измерений:')
  setCell(sheet, r++, 15, '18.09.2026')
  setCell(sheet, r++, 0, 'Средства измерений:')
  setCell(
    sheet,
    r++,
    0,
    '1) Измеритель, зав.№ 08024, свидетельство № А-1, действительна до 01.01.2027',
  )
  setCell(sheet, r, 0, 'Протокол оформил:')
  setCell(sheet, r++, 20, 'Судницын А.В.')

  const addEnergy = (
    label: string,
    objectLine: string,
    values: { set: string; y: number; fmt: string; raw: [number, number, number, number] }[],
  ) => {
    setCell(sheet, r++, 0, label)
    setCell(sheet, r++, 0, objectLine)
    for (const v of values) {
      setCell(sheet, r, COL.A, v.set)
      setCell(sheet, r, COL.Y, v.y, v.fmt)
      setCell(sheet, r, COL.AM, 1)
      setCell(sheet, r, COL.BB, v.raw[0])
      setCell(sheet, r, COL.BC, v.raw[1])
      setCell(sheet, r, COL.BD, v.raw[2])
      setCell(sheet, r, COL.BE, v.raw[3])
      r++
    }
  }

  addEnergy(
    'Результаты измерений энергии высоковольтного импульса при амплитуде импульса до 2 кВ',
    '1. Дефибриллятор: PRIMEDIC Defi-B, зав.№ D1',
    [
      { set: '10 (номинальная 10Дж±3Дж)*', y: 6.5, fmt: '0', raw: [6, 7, 7, 6] },
      { set: '20', y: 21, fmt: '0', raw: [21, 21, 21, 21] },
      { set: '40', y: 39, fmt: '0', raw: [39, 39, 39, 39] },
    ],
  )
  addEnergy(
    'Результаты измерений энергии высоковольтного импульса при амплитуде импульса от 2 до 8 кВ',
    '1. Дефибриллятор: PRIMEDIC Defi-B, зав.№ D1, 2015 г.',
    [
      { set: '70', y: 70, fmt: '0', raw: [70, 70, 70, 70] },
      { set: '120', y: 119, fmt: 'General', raw: [119, 119, 119, 119] },
      { set: '160', y: 162.5, fmt: '0', raw: [162, 163, 162, 163] },
      { set: '200', y: 197, fmt: '0', raw: [197, 197, 197, 197] },
      { set: '220', y: 222, fmt: '0', raw: [222, 222, 222, 222] },
      { set: '280', y: 280, fmt: '0', raw: [280, 280, 280, 280] },
    ],
  )
  setCell(sheet, r++, 0, 'Результаты измерений интервала времени, с')
  setCell(sheet, r++, 0, '1. Дефибриллятор: PRIMEDIC Defi-B, зав.№ D1, 2015 г.')
  setCell(sheet, r, COL.A, 'интервал')
  setCell(sheet, r, COL.Y, 9.350000000000001, '0.0')
  setCell(sheet, r, COL.BB, 9.3)
  setCell(sheet, r, COL.BC, 9.4)
  setCell(sheet, r, COL.BD, 9.3)
  setCell(sheet, r, COL.BE, 9.4)
  r++

  finalize(sheet, r + 2, COL.BJ)
  return toBuffer(wb)
}
