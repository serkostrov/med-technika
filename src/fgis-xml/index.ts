export { emitProtocolXml, wrapProtocolsDocument } from './emit-protocol'
export type { ProtocolXmlContext } from './emit-protocol'
export { validateAgainstFgisXsd } from './validate-xsd'
export {
  canonicalizeFgisXml,
  xmlEqualCanonically,
  firstCanonicalDiff,
} from './canonicalize'
export {
  buildFgisXmlPackage,
  buildProtocolXmlPreview,
} from './service'
export type {
  BuildFgisXmlResult,
  BuildFgisXmlOptions,
  SkippedProtocol,
} from './service'
export { FGIS_PROTOCOL_XSD } from './xsd/schema'
export { toFgisPhone, arrayBufferToBase64 } from './util'
