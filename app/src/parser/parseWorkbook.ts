export type Skill = 'PD' | 'AB' | 'WM' | 'HT' | 'PE' | 'IR'
export type Stage = 'baseline' | 'week' | 'final'

export interface ItemKey {
  answer: string
  derivation: string
  trap: string
  /** Bold tokens from the answer cell, used to auto-suggest a mark. */
  expected: string[]
  /** True when the key gives no single checkable answer (rubric-scored). */
  open: boolean
  /** Extra prose (model answers) attached to the item. */
  model: string
}

/** A time label the workbook attaches to an Item's own text. */
export interface ItemTiming {
  minutes: number
  strict: boolean
  /** target = per-Item goal; limit = a stated time limit for the Item or, on a Block's first Item, the Block. */
  kind: 'target' | 'limit'
}

export interface Item {
  id: string
  stage: Stage
  week: number | null
  day: number | null
  /** A–E for programme blocks, `challenge` for Day 6, section letter/number otherwise. */
  block: string
  skill: Skill
  points: number
  star: boolean
  /** Workbook's explicit `*(multi-step)*` tag in the header (WM Items). Not the star. */
  multiStepTag: boolean
  trapItem: boolean
  /** Markdown body as authored. */
  body: string
  timing: ItemTiming | null
  key: ItemKey | null
}

export interface WeekMeta {
  week: number
  title: string
  phase: string
}

export interface DayMeta {
  week: number
  day: number
  title: string
  /** First minutes figure in the Day heading parenthetical, e.g. 60 for (60 min), 75 for (≈ 75 min). */
  limitMin: number | null
}

export interface Workbook {
  items: Item[]
  weeks: WeekMeta[]
  days: DayMeta[]
}

const ITEM_HEADER = /^#### (\S+) · (PD|AB|WM|HT|PE|IR) · (\d+) pts?(.*)$/
const HEADING = /^#{1,4} /

function stageOf(id: string): Stage {
  if (/^B\d-/.test(id)) return 'baseline'
  if (id.startsWith('F-')) return 'final'
  return 'week'
}

function blockOf(id: string): string {
  const m = /^W\d+D(\d+)-(.+)$/.exec(id)
  if (m) {
    if (/^\d+$/.test(m[2])) return 'challenge'
    return m[2][0]
  }
  const b = /^B(\d)-/.exec(id)
  if (b) return b[1]
  const f = /^F-([A-Z])/.exec(id)
  return f ? f[1] : ''
}

const TIMED = /\bTimed:?\s+(\d+)\s*min\b(\s+strict)?/i
const PAREN = /\(\s*(target\s+)?(\d+)(?:\s*[–-]\s*(\d+))?\s*min\b([^)]*)\)/i

/** Read a time label from the opening line of an Item's text (labels sit in its bold lead-in). */
export function parseTiming(body: string): ItemTiming | null {
  const head = body.split('\n')[0].slice(0, 200)
  const t = TIMED.exec(head)
  if (t) return { minutes: Number(t[1]), strict: !!t[2], kind: 'limit' }
  const p = PAREN.exec(head)
  if (!p) return null
  return {
    minutes: Number(p[3] ?? p[2]),
    strict: /strict/i.test(p[4]),
    kind: p[1] ? 'target' : 'limit',
  }
}

export function parseItems(lines: string[], end: number): Item[] {
  const items: Item[] = []
  let inFence = false
  for (let i = 0; i < end; i++) {
    const line = lines[i]
    if (line.startsWith('```')) inFence = !inFence
    if (inFence) continue
    const m = ITEM_HEADER.exec(line)
    if (!m) continue
    const [, id, skill, pts, rest] = m
    const body: string[] = []
    let fence = false
    for (let j = i + 1; j < end; j++) {
      const l = lines[j]
      if (l.startsWith('```')) fence = !fence
      if (!fence && (HEADING.test(l) || l.trim() === '---')) break
      body.push(l)
    }
    const wd = /^W(\d+)D(\d+)-/.exec(id)
    items.push({
      id,
      stage: stageOf(id),
      week: wd ? Number(wd[1]) : null,
      day: wd ? Number(wd[2]) : null,
      block: blockOf(id),
      skill: skill as Skill,
      points: Number(pts),
      star: rest.includes('★'),
      multiStepTag: rest.includes('(multi-step)'),
      trapItem: rest.includes('🪤'),
      body: body.join('\n').trim(),
      timing: null,
      key: null,
    })
  }
  return items
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/\s\|\s/)
    .map((c) => c.trim())
}

function boldTokens(cell: string): string[] {
  return [...cell.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1])
}

const ITEM_REF = /^\*\*((?:W\d+D\d+-\w+|F-\w+|B\d-\d+))\b/

export function parseKey(lines: string[], start: number): Map<string, ItemKey> {
  const keys = new Map<string, ItemKey>()
  let scope: Stage = 'baseline'
  let week = 0
  let day = 0

  for (let i = start; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('# PART 5')) break
    let h: RegExpExecArray | null
    if (/^## KEY — BASELINE/.test(line)) scope = 'baseline'
    else if ((h = /^## KEY — WEEK (\d+)/.exec(line))) {
      scope = 'week'
      week = Number(h[1])
    } else if (/^## KEY — FINAL/.test(line)) scope = 'final'
    else if ((h = /^### Day (\d+)/.exec(line))) day = Number(h[1])

    if (line.startsWith('|')) {
      const cells = splitRow(line)
      const raw = cells[0].replace(/[★🪤*\s]/g, '')
      if (!raw || raw === 'Item' || /^:?-+:?$/.test(raw)) continue
      let id: string
      if (scope === 'baseline') {
        if (!/^B\d-\d+$/.test(raw)) continue
        id = raw
      } else if (scope === 'final') {
        id = `F-${raw}`
      } else {
        id = `W${week}D${day}-${raw}`
      }
      const answer = cells[1] ?? ''
      const last = cells.length >= 3 ? cells[cells.length - 1] : ''
      const derivation = cells.length >= 4 ? cells.slice(2, -1).join(' | ') : ''
      const expected = boldTokens(answer)
      const open = /\*open|see below|see model|open \(/i.test(answer) || expected.length === 0
      keys.set(id, { answer, derivation, trap: last, expected, open, model: '' })
      continue
    }

    // Prose entries: baseline model answers and week model answers.
    const ref = ITEM_REF.exec(line)
    if (ref) {
      const id = ref[1]
      const para: string[] = []
      for (let j = i; j < lines.length && lines[j].trim() !== '' && !HEADING.test(lines[j]); j++) {
        para.push(lines[j])
      }
      const text = para.join('\n')
      const existing = keys.get(id)
      if (existing) {
        existing.model = existing.model ? `${existing.model}\n\n${text}` : text
      } else {
        // Baseline open items are answered by prose alone.
        keys.set(id, { answer: '', derivation: '', trap: '', expected: [], open: true, model: text })
      }
    }
  }
  return keys
}

export function parseOutline(lines: string[], end: number): { weeks: WeekMeta[]; days: DayMeta[] } {
  const weeks: WeekMeta[] = []
  const days: DayMeta[] = []
  let week = 0
  for (let i = 0; i < end; i++) {
    let m = /^# WEEK (\d+) — (.+)$/.exec(lines[i])
    if (m) {
      week = Number(m[1])
      const phase = /\*\*Phase:\*\*\s*([A-Za-z]+)/.exec(lines.slice(i, i + 5).join('\n'))
      weeks.push({ week, title: m[2].trim(), phase: phase ? phase[1] : '' })
      continue
    }
    m = /^## Day (\d+) — (.+?)(?:\s*\((.*)\))?$/.exec(lines[i])
    if (m && week) {
      const mins = m[3] ? /(\d+)\s*min/.exec(m[3]) : null
      days.push({ week, day: Number(m[1]), title: m[2].trim(), limitMin: mins ? Number(mins[1]) : null })
    }
  }
  return { weeks, days }
}

export function parseWorkbook(md: string): Workbook {
  const lines = md.split(/\r?\n/)
  const keyStart = lines.findIndex((l) => l.startsWith('# PART 4'))
  const items = parseItems(lines, keyStart)
  const keys = parseKey(lines, keyStart)
  for (const it of items) {
    it.key = keys.get(it.id) ?? null
    it.timing = parseTiming(it.body)
  }
  return { items, ...parseOutline(lines, keyStart) }
}
