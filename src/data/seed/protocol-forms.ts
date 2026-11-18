import type { ProtocolForm } from '@/domain'
import { FormStatus } from '@/domain'
import { SeedIds } from '@/data/ids'

/**
 * Формы из Приложения Б.
 * status=ready — формы с материалами П+X (ТЗ App. Б) и готовым профилем.
 * Остальные — no_materials (без заполненного протокола и/или XML).
 *
 * «Дети_» (26-ЭД), «Прил. МУК 4.3.2812-10» (26-О), «Кратность…» (26-АС) —
 * приложения, не формы (ответ ИЛ 16.11.2026).
 * в seed не включаем до ответа клиента.
 */
export const SEED_PROTOCOL_FORMS: readonly ProtocolForm[] = [
  {
    id: SeedIds.formUhf,
    kindId: 1,
    templateFile: 'шаблон-26-МТ',
    sheetName: 'УВЧ-терапия',
    title: 'УВЧ-терапия',
    parserProfile: 'physio-bb',
    status: FormStatus.ready,
    typeObjectId: 1,
    fgisDirectory: 'DM-55254',
    conditionsLimits: { t: [15, 35], rh: [0, 80], p: [84, 106] },
    settings: { numberSuffix: 'УВЧ' },
  },
  {
    id: SeedIds.formLf,
    kindId: 1,
    templateFile: 'шаблон-26-МТ',
    sheetName: 'НЧ-терапия',
    title: 'НЧ-терапия',
    parserProfile: 'physio-bb',
    status: FormStatus.ready,
    typeObjectId: 1,
    fgisDirectory: 'DM-55254',
    conditionsLimits: { t: [15, 35], rh: [0, 80], p: [84, 106] },
    settings: { numberSuffix: 'МТ' },
  },
  {
    id: SeedIds.formDf,
    kindId: 1,
    templateFile: 'шаблон-26-МТ',
    sheetName: 'Дефибриллятор ИЭВИ',
    title: 'Дефибриллятор ИЭВИ',
    parserProfile: 'physio-df',
    status: FormStatus.ready,
    typeObjectId: 1,
    fgisDirectory: 'DM-55254',
    conditionsLimits: null,
    settings: { numberSuffix: 'ДФ' },
  },
  ...formBatch(1, 'шаблон-26-МТ', 'physio-bb', [
    'ПОТОК-1',
    'Магнито-терапия',
    'Лазер ИМИ',
    'Центрифуги',
    // Прил. Б: «ИВЛ, концентраторы» — в файлах это два листа: «ИВЛ» и «концентраторы»
    'ИВЛ',
  ]).map((f) => {
    // эталоны 50-26-МТ, 57-26-МТ, 47-26-МТ, 4-26-Ц: продукция, у текстовых показателей Directory пустой
    const ready: Record<string, Record<string, unknown>> = {
      'ПОТОК-1': { numberSuffix: 'МТ' },
      'Магнито-терапия': { numberSuffix: 'МТ' },
      // FullNameObject — полное «наименование объекта» позиции ОА (п. 1.50)
      'Лазер ИМИ': { numberSuffix: 'МТ', objectFullNameFromOa: 'full' },
      Центрифуги: { numberSuffix: 'Ц' },
      ИВЛ: { numberSuffix: 'ИВЛ' },
    }
    const settings = ready[f.sheetName]
    return settings
      ? {
          ...f,
          // ИВЛ — своя таблица «Определяемый показатель | значение | ±U | единица»
          parserProfile: f.sheetName === 'ИВЛ' ? 'ivl' : f.parserProfile,
          status: FormStatus.ready,
          typeObjectId: 1,
          settings: { ...settings, textIndicatorDirectory: '' },
        }
      : f
  }),
  {
    // эталон 6-26-ИВЛ: таблица как у 26-МТ (показатель в AK)
    id: SeedIds.formOxygenConcentrator,
    kindId: 1,
    templateFile: 'шаблон-26-МТ',
    sheetName: 'концентраторы',
    title: 'Концентраторы кислорода',
    parserProfile: 'physio-bb',
    status: FormStatus.ready,
    typeObjectId: 1,
    fgisDirectory: 'DM-55254',
    conditionsLimits: null,
    settings: { numberSuffix: 'ИВЛ', textIndicatorDirectory: '' },
  },
  ...formBatch(2, 'шаблон-26-ЭП', 'xray', [
    '2 р.м плёнка и цифра',
    'Телеуправляемый УРИ+цифра',
    '3 р.м. УРИ+цифра',
    'Палатный без скопии+цифра',
    'Палатный со скопией+цифра',
    'Флюорограф без УРИ',
    'Флюорограф с УРИ',
    'Маммограф пленка+цифра',
    'Ортопантомограф плёнка+цифра',
  ]).map((f) =>
    // эталоны 412, 385, 386, 403, 408, 414-26-ЭП
    ['2 р.м плёнка и цифра', 'Телеуправляемый УРИ+цифра', 'Палатный со скопией+цифра', 'Ортопантомограф плёнка+цифра', 'Маммограф пленка+цифра', 'Флюорограф без УРИ'].includes(f.sheetName.trim())
      ? {
          ...f,
          status: FormStatus.ready,
          typeObjectId: 1,
          settings: { numberSuffix: 'ЭП', objectFullNameFromOa: true, textIndicatorDirectory: '' },
        }
      : f,
  ),
  {
    id: SeedIds.formXrayDental,
    kindId: 2,
    templateFile: 'шаблон-26-ЭП',
    sheetName: 'Дентальный с визиографом и без',
    title: 'Дентальный с визиографом и без',
    parserProfile: 'xray',
    status: FormStatus.ready,
    // продукция; эталон 426-26-ЭП: FullNameObject из ОА, у текстовых показателей Directory пустой
    typeObjectId: 1,
    fgisDirectory: 'DM-55254',
    conditionsLimits: null,
    settings: { numberSuffix: 'ЭП', objectFullNameFromOa: true, textIndicatorDirectory: '' },
  },
  ...formBatch(3, 'шаблон-26-ЭП КТ', 'xray-ct', ['КТ периодич', 'КТ приёмка']).map((f) =>
    // эталон 419-26-ЭП
    f.sheetName === 'КТ периодич'
      ? {
          ...f,
          status: FormStatus.ready,
          typeObjectId: 1,
          settings: { numberSuffix: 'ЭП', objectFullNameFromOa: true, textIndicatorDirectory: '' },
        }
      : f,
  ),
  // 26-ЭД обычный (Прил. Б); «Дети_» — приложение (ИЛ 16.11.2026), не форма
  ...formBatch(4, 'шаблон-26-ЭД обычный', 'dose', [
    'новый рентген аппараты и флюхи',
    'Ортопан и 3DКТ',
    'Маммограф_',
    'Дентальный_',
    'Взрослые_',
    'Флюорография_',
    'КТ_',
  ]),
  // 26-ЭД расширенный: те же имена листов, что в «обычном», — id с индекса 20
  ...formBatch(4, 'шаблон-26-ЭД расширенный', 'dose', [
    'новый рентген аппараты',
    'палатник рентген',
    'Флюха SID 1,8',
    'Флюха SID 1,5',
    'Флюха SID 1,2',
    'Флюха SID 1,0',
    'Флюха SID 0,8',
    'Палатник 75 кв',
    'новый рентген аппараты ГЕЛПИКИ',
    'Ортопан и 3DКТ',
    'Маммограф_',
    'Дентальный_',
    'КТ_',
    'Взрослые_',
    'Флюорография_',
  ]).map((f, i) => {
    const form = { ...f, id: stableFormId(4, 20 + i) }
    // эталоны 272-26-ЭД (Дентальный_), 251 / 252-26-ЭД (новый рентген аппараты, палатник рентген)
    return ['Дентальный_', 'новый рентген аппараты', 'палатник рентген'].includes(f.sheetName)
      ? {
          ...form,
          // продукция, объект — из ОА (радиационный выход)
          status: FormStatus.ready,
          typeObjectId: 1,
          settings: { numberSuffix: 'ЭД', objectFullNameFromOa: true },
        }
      : form
  }),
  ...formBatch(5, 'шаблон-26-РК', 'rk', [
    '2 рабочих места',
    '3 рабочих места',
    '2 РМ суммация',
    '2РМ-ММГ суммация',
    '2 дентальных суммация',
    'Флюорограф С КАБИНОЙ',
    'Флюорограф БЕЗ КАБИНЫ',
    'С-Дуга',
    'Маммограф',
    'КТ',
    'Палатник',
    'Стоматологический',
    'Ангиограф',
  ]).map((f) =>
    // эталоны 328-26-РК, 302-26-РК, 305-26-РК, 322-26-РК, 324-26-РК
    ['Стоматологический', 'Палатник', 'КТ', '2 рабочих места', 'Флюорограф С КАБИНОЙ'].includes(
      f.sheetName,
    )
      ? {
          ...f,
          // эталон 328-26-РК: помещения/территории (TypeObjectId 8), объект — из ОА п.3.8
          status: FormStatus.ready,
          typeObjectId: 8,
          settings: { numberSuffix: 'РК', objectFullNameFromOa: true },
        }
      : f,
  ),
  ...formBatch(6, 'шаблон-26-СЗ', 'sz', ['Средства защиты (СЗ)_']),
  {
    id: SeedIds.formSzRandom,
    kindId: 6,
    templateFile: 'шаблон-26-СЗ',
    sheetName: 'Средства защиты (СЗ)_ РАНДОМ 25',
    title: 'Средства защиты (СЗ)_ РАНДОМ 25',
    parserProfile: 'sz',
    status: FormStatus.ready,
    // продукция; объект — из ОА (в протоколе нет «Наименование объекта») — эталон 125-26-СЗ
    typeObjectId: 1,
    fgisDirectory: 'DM-55254',
    conditionsLimits: null,
    settings: { numberSuffix: 'СЗ' },
  },
  ...formBatch(7, 'шаблон-26-ИДК', 'idk', ['Протокол'], {
    manualMeasureDates: true,
  }),
  ...formBatch(8, 'шаблон-26-АС', 'vent', [
    'Протокол lite',
    'Протокол МР 4.3.0212-20',
  ]).map((f) =>
    // эталон 262-26-АС: полная таблица МР (скорость, производительность в точке / общая, кратность)
    f.sheetName === 'Протокол МР 4.3.0212-20'
      ? {
          ...f,
          status: FormStatus.ready,
          typeObjectId: 8,
          settings: { numberSuffix: 'АС' },
        }
      : f,
  ),
  // листы новой редакции шаблона 26-АС — используются редко (ИЛ 16.11.2026);
  // новая редакция — по отдельному соглашению (Прил. № 2, п. 4), нужны П+X
  ...formBatch(8, 'шаблон-26-АС', 'vent', [
    'Протокол ГОСТ 12.3.018-79',
    'Протокол ГОСТ 34060-2017',
  ]).map((f, i) => ({ ...f, id: stableFormId(8, 10 + i) })),
  {
    id: SeedIds.formVentLite,
    kindId: 8,
    templateFile: 'шаблон-26-АС',
    sheetName: 'Протокол МР 4.3.0212-20 (LITE)',
    title: 'Протокол МР 4.3.0212-20 (LITE)',
    parserProfile: 'vent',
    status: FormStatus.ready,
    // вентиляционные системы — TypeObjectId 8, показатели с IndicatorId (эталон 260-26-АС)
    typeObjectId: 8,
    fgisDirectory: 'DM-55254',
    conditionsLimits: null,
    settings: { numberSuffix: 'АС' },
  },
  // Прил. Б: 3 формы — МИ / ГОСТ / БВЕК (раньше — одна запись с составным именем листа)
  {
    id: SeedIds.formMicroMi,
    kindId: 9,
    templateFile: 'шаблон-26-МК',
    sheetName: 'Протокол Микроклимат МИ',
    title: 'Протокол Микроклимат МИ',
    parserProfile: 'micro',
    status: FormStatus.ready,
    // рабочие места; Directory пустой — как в эталоне 204-26-МК
    typeObjectId: 10,
    fgisDirectory: '',
    conditionsLimits: null,
    settings: { numberSuffix: 'МК' },
  },
  ...formBatch(9, 'шаблон-26-МК', 'micro', [
    'Протокол Микроклимат ГОСТ',
    'Протокол Микроклимат БВЕК',
  ]).map((f, i) => ({ ...f, id: stableFormId(9, i + 1) })),
  {
    id: SeedIds.formLight,
    kindId: 10,
    templateFile: 'шаблон-26-О',
    sheetName: 'ГОСТ 24940-2016',
    title: 'ГОСТ 24940-2016',
    parserProfile: 'light',
    status: FormStatus.ready,
    // рабочие места; Directory пустой — как в эталоне 150-26-О
    typeObjectId: 10,
    fgisDirectory: '',
    conditionsLimits: null,
    settings: { numberSuffix: 'О' },
  },
  ...formBatch(11, 'шаблон-26-ПП', 'emf', ['МУК 4.3.2491-09']),
  ...formBatch(12, 'шаблон-26-ПЧ', 'emf', ['БВЕК.431440.08.04 РЭ']),
  {
    id: SeedIds.formEmfPch,
    kindId: 12,
    templateFile: 'шаблон-26-ПЧ',
    sheetName: 'ФР.1.34.2021.39109',
    title: 'ФР.1.34.2021.39109',
    parserProfile: 'emf',
    status: FormStatus.ready,
    // рабочие места; Directory пустой — как в эталоне 52-26-ПЧ
    typeObjectId: 10,
    fgisDirectory: '',
    conditionsLimits: null,
    settings: { numberSuffix: 'ПЧ' },
  },
  {
    id: SeedIds.formNoise,
    kindId: 13,
    templateFile: 'шаблон-26-Ш',
    sheetName: 'ГОСТ 9612',
    title: 'ГОСТ 9612',
    parserProfile: 'noise',
    status: FormStatus.ready,
    // рабочие места; Directory пустой — как в эталоне 29-26-Ш
    typeObjectId: 10,
    fgisDirectory: '',
    conditionsLimits: null,
    settings: { numberSuffix: 'Ш' },
  },
]

function formBatch(
  kindId: number,
  templateFile: string,
  parserProfile: string,
  sheetNames: string[],
  settings: Record<string, unknown> = {},
): ProtocolForm[] {
  return sheetNames.map((sheetName, index) => ({
    id: stableFormId(kindId, index),
    kindId,
    templateFile,
    sheetName,
    title: sheetName,
    parserProfile,
    status: FormStatus.no_materials,
    typeObjectId: null,
    fgisDirectory: 'DM-55254',
    conditionsLimits: null,
    settings,
  }))
}

/** Детерминированный UUID v4-shaped id для seed. */
function stableFormId(kindId: number, index: number): string {
  const n = kindId * 100 + index + 10
  const hex = n.toString(16).padStart(12, '0')
  return `33333333-3333-4333-8333-${hex}`
}
