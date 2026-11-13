/** Глобальная версия парсера. Любое изменение логики повышает версию (ТЗ §6.7). */
export const PARSER_VERSION = '1.9.0'

export const PROFILE_VERSIONS = {
  'physio-bb': '1.0.0',
  'physio-df': '1.0.2',
  noise: '1.0.0',
  emf: '1.0.0',
  light: '1.0.0',
  micro: '1.0.0',
  vent: '1.0.0',
  sz: '1.0.0',
  xray: '1.0.0',
  rk: '1.0.0',
  dose: '1.0.0',
} as const

export type KnownParserProfile = keyof typeof PROFILE_VERSIONS
