import raw from '../data/workbook.json'
import type { DayMeta, Item, Workbook, WeekMeta } from '../parser/parseWorkbook'

export const workbook = raw as unknown as Workbook

export interface BlockDef {
  key: string
  stage: Item['stage']
  week: number | null
  day: number | null
  label: string
  title: string
  itemIds: string[]
  limitMin: number | null
  strict: boolean
}

const BLOCK_LABEL: Record<string, { name: string; min: number }> = {
  A: { name: 'Warm-up', min: 10 },
  B: { name: 'Primary skill', min: 15 },
  C: { name: 'Secondary skill', min: 15 },
  D: { name: 'Novel / integrated', min: 10 },
}

const BASELINE: Record<string, { name: string; min: number; strict: boolean }> = {
  '1': { name: 'Pattern', min: 20, strict: false },
  '2': { name: 'Working memory', min: 20, strict: false },
  '3': { name: 'Abstraction', min: 25, strict: false },
  '4': { name: 'Hypothesis testing', min: 30, strict: false },
  '5': { name: 'Processing (timed)', min: 12, strict: true },
}

/** Weeks 9+ (Speed and Integration phases) apply strict clocks. */
const STRICT_FROM_WEEK = 9

function group(items: Item[], keyOf: (i: Item) => string): Map<string, Item[]> {
  const m = new Map<string, Item[]>()
  for (const it of items) {
    const k = keyOf(it)
    m.set(k, [...(m.get(k) ?? []), it])
  }
  return m
}

function build(): BlockDef[] {
  const out: BlockDef[] = []

  const base = group(workbook.items.filter((i) => i.stage === 'baseline'), (i) => i.block)
  for (const [b, items] of [...base].sort()) {
    const meta = BASELINE[b]
    out.push({
      key: `base:${b}`,
      stage: 'baseline',
      week: null,
      day: null,
      label: `Baseline · Section ${b}`,
      title: meta.name,
      itemIds: items.map((i) => i.id),
      limitMin: meta.min,
      strict: meta.strict,
    })
  }

  for (const w of workbook.weeks) {
    for (const d of workbook.days.filter((x) => x.week === w.week)) {
      const items = workbook.items.filter((i) => i.week === w.week && i.day === d.day)
      const byBlock = group(items, (i) => i.block)
      for (const [b, its] of [...byBlock].sort()) {
        const std = BLOCK_LABEL[b]
        const strict = w.week >= STRICT_FROM_WEEK
        out.push({
          key: `w${w.week}d${d.day}:${b}`,
          stage: 'week',
          week: w.week,
          day: d.day,
          label: `W${w.week} D${d.day} · ${std ? `Block ${b}` : b === 'challenge' ? 'Weekly challenge' : b === 'M' ? 'Mock exam' : `Block ${b}`}`,
          title: std ? std.name : b === 'challenge' ? 'Weekly challenge' : 'Timed mock exam',
          itemIds: its.map((i) => i.id),
          limitMin: std ? std.min : 60,
          strict,
        })
      }
    }
  }

  out.push({
    key: 'final:exam',
    stage: 'final',
    week: null,
    day: null,
    label: 'Final Examination',
    title: 'Final Examination (85 min, hard limit 90)',
    itemIds: workbook.items.filter((i) => i.stage === 'final').map((i) => i.id),
    limitMin: 85,
    strict: true,
  })
  return out
}

export const blocks: BlockDef[] = build()
export const blockByKey = new Map(blocks.map((b) => [b.key, b]))
export const itemById = new Map(workbook.items.map((i) => [i.id, i]))

export function blockOfItem(itemId: string): BlockDef | undefined {
  return blocks.find((b) => b.itemIds.includes(itemId))
}

export function weekMeta(week: number): WeekMeta | undefined {
  return workbook.weeks.find((w) => w.week === week)
}

export function dayMeta(week: number, day: number): DayMeta | undefined {
  return workbook.days.find((d) => d.week === week && d.day === day)
}

export const totalPoints = workbook.items.reduce((s, i) => s + i.points, 0)
