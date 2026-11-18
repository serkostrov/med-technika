import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { it } from 'vitest'
import { FormStatus } from '@/domain'
import { createSeedBundle } from '@/data/seed'
import { parseProtocol } from '@/parser'

const DIRS = ['26-МТ', '26-ЭП', '26-ЭД', '26-РК', '26-АС', '26-ПП', '26-ПЧ']
/**
 * Сортировка новых образцов лаборатории (служебный): какие формы уже читаются
 * текущими профилями. TRIAGE=1 npx vitest run src/parser/profiles/_triage.test.ts
 */
it.skipIf(!process.env.TRIAGE)('triage', { timeout: 120_000 }, () => {
  const seed = createSeedBundle()
  const forms = seed.protocolForms.map((f) => ({ ...f, status: FormStatus.ready }))
  const out: string[] = []
  for (const d of DIRS) {
    for (const f of readdirSync(d).filter((x) => x.endsWith('.xlsx'))) {
      const buf = readFileSync(join(d, f))
      const xml = readFileSync(join(d, f.replace(/\.xlsx$/, '.xml')), 'utf8')
      const ref = [...xml.matchAll(/<FactValue>([^<]*)<\/FactValue>/g)].map((m) => m[1])
      let line = `${d}/${f} | ref ${ref.length}`
      try {
        const p = parseProtocol({ data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, forms, indicatorMaps: seed.formIndicatorMaps })
        const got = p.results.map((r) => r.factValue)
        const same = JSON.stringify(got) === JSON.stringify(ref)
        line += ` | ${p.sheetName} (${p.parserProfile}) got ${got.length} | ${same ? 'MATCH' : 'diff'}`
        if (!same) line += ` | ref[0..6]=${ref.slice(0, 6).join(' ')} | got[0..6]=${got.slice(0, 6).join(' ')}`
      } catch (e) {
        line += ` | ERROR ${(e as Error).message.slice(0, 120)}`
      }
      out.push(line)
    }
  }
  console.log(out.join('\n'))
})
