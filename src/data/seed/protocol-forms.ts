import type { ProtocolForm } from '@/domain'
import { FormStatus } from '@/domain'
import { SeedIds } from '@/data/ids'

/**
 * Формы из Приложения Б.
 * status=ready только для трёх форм с материалами П+X (ТЗ App. Б).
 * Остальные — no_materials (без заполненного протокола и/или XML).
 *
 * Листы 26-ЭД («Дети_» и др.) и спорные приложения с [УТОЧНИТЬ]
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
    'ИВЛ, концентраторы',
  ]),
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
    'Дентальный с визиографом и без',
  ]),
  ...formBatch(3, 'шаблон-26-ЭП КТ', 'xray-ct', ['КТ периодич', 'КТ приёмка']),
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
  ]),
  ...formBatch(6, 'шаблон-26-СЗ', 'sz', [
    'Средства защиты (СЗ)_',
    'Средства защиты (СЗ)_ РАНДОМ 25',
  ]),
  ...formBatch(7, 'шаблон-26-ИДК', 'idk', ['Протокол'], {
    manualMeasureDates: true,
  }),
  ...formBatch(8, 'шаблон-26-АС', 'vent', [
    'Протокол lite',
    'Протокол МР 4.3.0212-20',
    'Протокол МР 4.3.0212-20 (LITE)',
  ]),
  ...formBatch(9, 'шаблон-26-МК', 'micro', [
    'Протокол Микроклимат МИ / ГОСТ / БВЕК',
  ]),
  ...formBatch(10, 'шаблон-26-О', 'light', ['ГОСТ 24940-2016']),
  ...formBatch(11, 'шаблон-26-ПП', 'emf', ['МУК 4.3.2491-09']),
  ...formBatch(12, 'шаблон-26-ПЧ', 'emf', [
    'БВЕК.431440.08.04 РЭ',
    'ФР.1.34.2021.39109',
  ]),
  ...formBatch(13, 'шаблон-26-Ш', 'noise', ['ГОСТ 9612']),
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
