import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import { FormStatus } from '@/domain'
import { createSeedBundle } from '@/data/seed'
import { parseProtocol } from '@/parser'

/** Служебный: сравнить FactValue протокола и эталона. CMP='322-26-РК;…' */
it.skipIf(!process.env.CMP)('cmp', () => {
  const seed = createSeedBundle()
  const forms = seed.protocolForms.map((f) => ({ ...f, status: FormStatus.ready }))
  for (const spec of process.env.CMP!.split(';')) {
    const [name, sheet] = spec.split('@') as [string, string | undefined]
    const buf = readFileSync(`src/parser/fixtures/real/${name}.xlsx`)
    const xml = readFileSync(`src/fgis-xml/fixtures/real/${name}.xml`, 'utf8')
    const ref = [...xml.matchAll(/<ResearchObjectInfo>([\s\S]*?)<\/ResearchObjectInfo>/g)].map((m) => {
      const b = m[1]!
      const g = (t: string) => new RegExp(`<${t}>\\s*([^<]*?)\\s*</${t}>`).exec(b)?.[1] ?? ''
      return `${g('FactValue')}[${g('IndicatorId') || g('UniqueIndicator').slice(0, 25)}|${g('MeasurementId')}]`
    })
    const p = parseProtocol({ data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, forms, indicatorMaps: seed.formIndicatorMaps, preferredSheetName: sheet ?? null })
    const got = p.results.map((r) => `${r.factValue}[${r.sourceKey}|${r.unitSymbol}]`)
    console.log(`== ${name} sheet=${p.sheetName} ref=${ref.length} got=${got.length}`)
    for (let i = 0; i < Math.max(ref.length, got.length); i++) console.log(`${i + 1}\t${ref[i] ?? ''}\t${got[i] ?? ''}`)
  }
})
