import type { DomainSnapshot } from '@/domain'
import { checkDomainIntegrity } from '@/domain'
import { createSeedBundle, type SeedBundle } from '@/data/seed'

export type AppStore = SeedBundle & {
  integrityViolations: ReturnType<typeof checkDomainIntegrity>
}

export function createAppStore(seed: SeedBundle = createSeedBundle()): AppStore {
  const snapshot: DomainSnapshot = {
    oaEditions: seed.oaEditions,
    oaItems: seed.oaItems,
    units: seed.units,
    unitConversions: seed.unitConversions,
    equipment: seed.equipment,
    equipmentVerifications: seed.equipmentVerifications,
    protocolForms: seed.protocolForms,
    formIndicatorMaps: seed.formIndicatorMaps,
    protocols: seed.protocols,
    protocolObjects: seed.protocolObjects,
    protocolResults: seed.protocolResults,
    protocolEquipment: seed.protocolEquipment,
    protocolIssues: seed.protocolIssues,
    fgisExports: seed.fgisExports,
    fgisExportItems: seed.fgisExportItems,
  }

  return {
    ...seed,
    integrityViolations: checkDomainIntegrity(snapshot),
  }
}

let singleton: AppStore | null = null

export function getAppStore(): AppStore {
  if (!singleton) singleton = createAppStore()
  return singleton
}

export function resetAppStore(): AppStore {
  singleton = createAppStore()
  return singleton
}
