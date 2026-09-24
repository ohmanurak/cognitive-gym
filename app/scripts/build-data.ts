import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWorkbook } from '../src/parser/parseWorkbook.ts'

const here = dirname(fileURLToPath(import.meta.url))
const md = readFileSync(resolve(here, '../../workbook/Cognitive_Gym_Workbook.md'), 'utf8')
const wb = parseWorkbook(md)
const missing = wb.items.filter((i) => !i.key).map((i) => i.id)
if (missing.length) throw new Error(`Items without a key: ${missing.join(', ')}`)
const out = resolve(here, '../src/data/workbook.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(wb))
console.log(`Wrote ${wb.items.length} items to ${out}`)
