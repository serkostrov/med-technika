import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { it } from 'vitest'
import { FormStatus } from '@/domain'
import { createSeedBundle } from '@/data/seed'
import { parseProtocol } from '@/parser'

const FILES = (process.env.GEN_FILES ?? '').split(';').filter(Boolean)
const tag = (b: string, t: string) => {
  const m = new RegExp(`<${t}>([^<]*)</${t}>`).exec(b)
  return m ? m[1]!.trim() : undefined
}
/**
 * Генератор данных справочника из пары «протокол + XML» лаборатории (служебный).
 * GEN_FILES='26-МТ/ПОТОК-1;…' GEN_OUT=out.json npx vitest run src/parser/profiles/_gen.test.ts
 */
it.skipIf(!process.env.GEN_FILES)('gen', () => {
  const seed = createSeedBundle()
  const forms = seed.protocolForms.map((f) => ({ ...f, status: FormStatus.ready }))
  const out: unknown[] = []
  for (const spec of FILES) {
    const [file, sheet] = spec.split('@') as [string, string | undefined]
    const buf = readFileSync(file + '.xlsx')
    const xmlPath = existsSync(file + '.xml') ? file + '.xml' : `src/fgis-xml/fixtures/real/${basename(file)}.xml`
    const xml = readFileSync(xmlPath, 'utf8').replace(/<Content>[\s\S]*?<\/Content>/, '')
    const p = parseProtocol({ data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, forms, indicatorMaps: seed.formIndicatorMaps, preferredSheetName: sheet ?? null })
    const infos = [...xml.matchAll(/<ResearchObjectInfo>([\s\S]*?)<\/ResearchObjectInfo>/g)].map((m) => m[1]!)
    const byKey: Record<string, unknown> = {}
    p.results.forEach((r, i) => {
      const b = infos[i]
      if (!b || byKey[r.sourceKey]) return
      byKey[r.sourceKey] = {
        unit: r.unitSymbol, ind: tag(b, 'IndicatorId'), uind: tag(b, 'UniqueIndicator'), dir: tag(b, 'Directory'),
        meas: tag(b, 'MeasurementId'), umeas: tag(b, 'UniqueMeasurement'), doc: tag(b, 'DocNameId'),
        umeth: tag(b, 'UniqueMethod'), meth: tag(b, 'DocNameMethodikId'), fact: r.factValue, xmlFact: tag(b, 'FactValue'),
      }
    })
    out.push({
      file, sheet: p.sheetName, formId: p.formId, profile: p.parserProfile,
      type: tag(xml, 'TypeObjectId'), mgd: tag(xml, 'ModelGetDate'), full: tag(xml, 'FullNameObject'), headerObj: p.metadata.objectFullName,
      terr: tag(xml, 'TerritoryFeature'), eq: [...xml.matchAll(/<EquipmentId>(\d+)</g)].map((m) => m[1]), parsedEq: p.equipment.map((e) => e.serialRaw),
      staff: [...xml.matchAll(/<idFullName>(\d+)</g)].map((m) => m[1]), eng: p.metadata.engineerShortName,
      inn: tag(xml, 'InnId'), ogrn: tag(xml, 'OgrnId'), cust: p.metadata.customerName, app: tag(xml, 'ApplicationDate'),
      phone: tag(xml, 'Number'), phoneXl: p.metadata.customerPhone, legal: p.metadata.customerLegalAddress,
      keys: byKey,
    })
  }
  writeFileSync(process.env.GEN_OUT!, JSON.stringify(out, null, 1))
})
