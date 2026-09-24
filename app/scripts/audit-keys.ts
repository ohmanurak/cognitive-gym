import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWorkbook } from '../src/parser/parseWorkbook.ts'

const here = dirname(fileURLToPath(import.meta.url))
const md = readFileSync(resolve(here, '../../workbook/Cognitive_Gym_Workbook.md'), 'utf8')
const lines = md.split(/\r?\n/)
const wb = parseWorkbook(md)
const keyStart = lines.findIndex((l) => l.startsWith('# PART 4'))

// Independent pass over Part 4 table rows to find id collisions and orphans.
let scope = 'baseline'
let week = 0
let day = 0
const seen = new Map<string, number[]>()
for (let i = keyStart; i < lines.length; i++) {
  const l = lines[i]
  if (l.startsWith('# PART 5')) break
  let m: RegExpExecArray | null
  if (/^## KEY — BASELINE/.test(l)) scope = 'baseline'
  else if ((m = /^## KEY — WEEK (\d+)/.exec(l))) {
    scope = 'week'
    week = Number(m[1])
  } else if (/^## KEY — FINAL/.test(l)) scope = 'final'
  else if ((m = /^### Day (\d+)/.exec(l))) day = Number(m[1])
  if (!l.startsWith('|')) continue
  const first = l.replace(/^\|/, '').split(/\s\|\s/)[0].trim().replace(/[★🪤*\s]/g, '')
  if (!first || first === 'Item' || /^:?-+:?$/.test(first)) continue
  const id = scope === 'baseline' ? first : scope === 'final' ? `F-${first}` : `W${week}D${day}-${first}`
  seen.set(id, [...(seen.get(id) ?? []), i + 1])
}

const itemIds = new Set(wb.items.map((i) => i.id))
const dup = [...seen].filter(([, ls]) => ls.length > 1)
const orphan = [...seen].filter(([id]) => !itemIds.has(id))
const noRow = wb.items.filter((i) => !seen.has(i.id))
const open = wb.items.filter((i) => i.key?.open)
const openNoModel = open.filter((i) => !i.key!.model && !i.key!.derivation)
const closedNoBold = wb.items.filter((i) => !i.key!.open && i.key!.expected.length === 0)
const multi = wb.items.filter((i) => !i.key!.open && i.key!.expected.length > 1)
const emptyAnswer = wb.items.filter((i) => !i.key!.answer && !i.key!.model)

const show = (t: string, xs: string[]) => console.log(`\n${t} (${xs.length})${xs.length ? ':\n  ' + xs.join(', ') : ''}`)
console.log(`items=${wb.items.length} keyRows=${seen.size}`)
show('DUPLICATE key row ids (later row overwrites earlier)', dup.map(([id, ls]) => `${id}@${ls.join('/')}`))
show('ORPHAN key rows (no matching item)', orphan.map(([id, ls]) => `${id}@${ls[0]}`))
show('Items with NO table row (key only from prose)', noRow.map((i) => i.id))
show('Open/rubric items', open.map((i) => i.id))
show('Open items with no derivation or model text', openNoModel.map((i) => i.id))
show('Closed items whose key has no bold token', closedNoBold.map((i) => i.id))
show('Items with no answer text and no model', emptyAnswer.map((i) => i.id))
console.log(`\nMulti-token (multi-part) checkable items: ${multi.length}`)
