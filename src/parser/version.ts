/** Глобальная версия парсера. Любое изменение логики повышает версию (ТЗ §6.7). */
export const PARSER_VERSION = '1.0.1'

export const PROFILE_VERSIONS = {
  'physio-bb': '1.0.0',
  'physio-df': '1.0.1',
} as const

export type KnownParserProfile = keyof typeof PROFILE_VERSIONS
