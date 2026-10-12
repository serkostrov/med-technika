export type {
  ExcelRawMeasurements,
  ExcelComputed,
  ExcelDisplayValue,
  ServerRecalc,
  FactValueText,
  MeasurementValueLayers,
} from './values'

export {
  recalcMeanAndU,
  exceedsRecalcTolerance,
  ubFromMap,
  getRecalcTolerance,
} from './recalc'
export type { UbParams } from './recalc'

export {
  computeFactValue,
  formatFactValue,
  parseFactValueNumber,
  FACT_VALUE_CASES,
} from './fact-value'

export { matchCustomerByName } from './matching/customer'
export { matchEquipment } from './matching/equipment'
export { matchEngineer } from './matching/staff'
export { matchIndicator } from './matching/indicator'
export { matchUnit } from './matching/unit'

export {
  confirmIndicatorMapping,
  applyIndicatorMapsToProtocol,
} from './learnable-map'

export {
  protocolRunChecks,
  rerunChecksForActiveProtocols,
  isProtocolActiveForChecks,
} from './engine'

export {
  resolveSeverity,
  applyFindings,
  setSeverityOverride,
  getSeverityOverrides,
  IssueSeverity,
} from './checks/types'
export type { CheckCode, CheckFinding } from './checks/types'
