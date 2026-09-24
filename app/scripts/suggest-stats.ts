import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWorkbook } from '../src/parser/parseWorkbook.ts'
import { suggest } from '../src/lib/grade.ts'

const here = dirname(fileURLToPath(import.meta.url))
const wb = parseWorkbook(readFileSync(resolve(here, '../../workbook/Cognitive_Gym_Workbook.md'), 'utf8'))
const items = wb.items
const closed = items.filter((i) => !i.key!.open)
const partial = items.filter((i) => i.key!.open && i.key!.expected.length > 0)
const pureOpen = items.filter((i) => i.key!.open && i.key!.expected.length === 0)
const tok = (i: (typeof items)[number]) => i.key!.expected
const num = /^[-−+]?[\d,]*\.?\d+%?$/
const allNumeric = closed.filter((i) => tok(i).every((t) => num.test(t.trim())))
const single = closed.filter((i) => tok(i).length === 1)
const singleNumeric = single.filter((i) => num.test(tok(i)[0].trim()))
const words = closed.filter((i) => tok(i).some((t) => /[a-zA-Z]{3,}/.test(t)))
const symbols = closed.filter((i) => tok(i).some((t) => /[≈→×÷^√∈≥≤±/]|\bor\b/.test(t)))
const okSelf = closed.filter((i) => suggest(tok(i).join(' '), tok(i), false) === 'full')
console.log({
  total: items.length,
  closedCheckable: closed.length,
  partialOpen_withCheckableParts: partial.length,
  pureOpen: pureOpen.length,
  closed_singleToken: single.length,
  closed_singleNumeric: singleNumeric.length,
  closed_allNumeric: allNumeric.length,
  closed_withWords: words.length,
  closed_withSymbolsOrAlternatives: symbols.length,
  closed_multiToken: closed.filter((i) => tok(i).length > 1).length,
  selfConsistent: okSelf.length,
})
const ex = (xs: typeof items, n = 8) => xs.slice(0, n).map((i) => `${i.id}: ${tok(i).join(' | ')}`)
console.log('\nsymbol/alternative examples:', ex(symbols, 10))
console.log('\nword examples:', ex(words.filter((i) => !symbols.includes(i)), 8))
console.log('\npartial examples:', ex(partial, 6))
// probe common human variants against the suggester
const probes: [string, string[]][] = [
  ['10458', ['10,458']], ['1/33', ['1/33 ≈ 3.0 %']], ['0.75', ['3/4']], ['Second', ['Second']],
  ['second', ['Second']], ['37', ['37 L']], ['24', ['24 km/h']],
]
console.log('\nprobes:', probes.map(([a, e]) => `${a} vs ${e[0]} -> ${suggest(a, e, false)}`))
