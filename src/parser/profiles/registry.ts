import type { FormIndicatorMap, ProtocolForm } from '@/domain'
import { FormStatus } from '@/domain'
import { parsePhysioBb } from './physio-bb'
import { parsePhysioDf } from './physio-df'
import type { SheetGrid } from '../sheet-utils'
import type { ParsedObject, ParsedResult } from '../types'
import { PROFILE_VERSIONS, type KnownParserProfile } from '../version'
import { ParseError } from '../types'

export function isImplementedProfile(
  profile: string,
): profile is KnownParserProfile {
  return profile === 'physio-bb' || profile === 'physio-df'
}

export function runProfile(
  profile: string,
  grid: SheetGrid,
  maps: readonly FormIndicatorMap[],
  recalcTolerance: number,
): { objects: ParsedObject[]; results: ParsedResult[]; log: string[]; profileVersion: string } {
  if (!isImplementedProfile(profile)) {
    throw new ParseError(
      `Файл не распознан: профиль «${profile}» ещё не реализован (нет материалов/готового профиля)`,
      'PROFILE_NOT_READY',
    )
  }

  if (profile === 'physio-bb') {
    const parsed = parsePhysioBb(grid, maps, recalcTolerance)
    return { ...parsed, profileVersion: PROFILE_VERSIONS['physio-bb'] }
  }
  const parsed = parsePhysioDf(grid, maps, recalcTolerance)
  return { ...parsed, profileVersion: PROFILE_VERSIONS['physio-df'] }
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
