import type { FormIndicatorMap, ProtocolForm } from '@/domain'
import { FormStatus } from '@/domain'
import { parsePhysioBb } from './physio-bb'
import { parsePhysioDf } from './physio-df'
import { parseNoise } from './noise'
import { parseEmf } from './emf'
import { parseLight } from './light'
import { parseMicro } from './micro'
import { parseVent } from './vent'
import { parseSz } from './sz'
import { parseXray } from './xray'
import { parseRk } from './rk'
import { parseDose } from './dose'
import type { SheetGrid } from '../sheet-utils'
import type { ParsedObject, ParsedResult } from '../types'
import { PROFILE_VERSIONS, type KnownParserProfile } from '../version'
import { ParseError } from '../types'

type ProfileOutput = { objects: ParsedObject[]; results: ParsedResult[]; log: string[] }

type ProfileRunner = (
  grid: SheetGrid,
  maps: readonly FormIndicatorMap[],
  recalcTolerance: number,
) => ProfileOutput

/** Реализованные профили разбора. Новая форма — новая строка здесь и в PROFILE_VERSIONS. */
const PROFILES: Record<KnownParserProfile, ProfileRunner> = {
  'physio-bb': parsePhysioBb,
  'physio-df': parsePhysioDf,
  noise: (grid) => parseNoise(grid),
  emf: (grid) => parseEmf(grid),
  light: (grid) => parseLight(grid),
  micro: (grid) => parseMicro(grid),
  vent: (grid) => parseVent(grid),
  sz: (grid) => parseSz(grid),
  xray: (grid) => parseXray(grid),
  rk: (grid) => parseRk(grid),
  dose: (grid) => parseDose(grid),
}

export function isImplementedProfile(
  profile: string,
): profile is KnownParserProfile {
  return Object.prototype.hasOwnProperty.call(PROFILES, profile)
}

export function runProfile(
  profile: string,
  grid: SheetGrid,
  maps: readonly FormIndicatorMap[],
  recalcTolerance: number,
): ProfileOutput & { profileVersion: string } {
  if (!isImplementedProfile(profile)) {
    throw new ParseError(
      `Файл не распознан: профиль «${profile}» ещё не реализован (нет материалов/готового профиля)`,
      'PROFILE_NOT_READY',
    )
  }
  const parsed = PROFILES[profile](grid, maps, recalcTolerance)
  return { ...parsed, profileVersion: PROFILE_VERSIONS[profile] }
}

export function assertFormReadyForParse(form: ProtocolForm): void {
  if (form.status === FormStatus.no_materials) {
    throw new ParseError(
      `Файл не распознан: для формы «${form.title}» нет материалов (статус no_materials)`,
      'NO_MATERIALS',
    )
  }
  if (!isImplementedProfile(form.parserProfile)) {
    throw new ParseError(
      `Файл не распознан: профиль «${form.parserProfile}» не реализован`,
      'PROFILE_NOT_READY',
    )
  }
}
