import raw from '../data/workbook.json'
import type { DayMeta, Item, Workbook, WeekMeta } from '../parser/parseWorkbook'

export const workbook = raw as unknown as Workbook

/** Where a Block's time limit came from, so the audit can list any Block the workbook never times. */
export type LimitSource = 'label' | 'day-heading' | 'protocol' | 'baseline' | 'final' | 'item-targets' | 'none'

export interface PaceMarker {
  label: string
  atMin: number
}

export interface BlockDef {
  key: string
  stage: Item['stage']
  week: number | null
  day: number | null
  label: string
  title: string
  itemIds: string[]
  /** Stated limit or target in minutes; null means no countdown, elapsed time only. */
  limitMin: number | null
  /** Strict limits freeze the Timed answer (T) when they run out. */
  strict: boolean
  /** Point at which a strict clock actually freezes when it differs from the target (Final: 85 target, 90 hard). */
  hardLimitMin: number | null
  limitSource: LimitSource
  /** Non-binding suggested section ends (Final Examination). */
  paceMarkers: PaceMarker[]
  /** Progress units when itemIds is empty (Span test Block counts as 2). */
  units?: number
  /** Counted Span test Block, run on its own page instead of BlockRunner. */
  spanTest?: boolean
}

const BLOCK_NAME: Record<string, string> = {
  A: 'Warm-up',
  B: 'Primary skill',
  C: 'Secondary skill',
  D: 'Novel / integrated',
}

/** Workbook 0.2 daily protocol. Applied only in Weeks 1-4, whose limits are "generous soft ceilings" (0.3). */
const PROTOCOL_MIN: Record<string, number> = { A: 10, B: 15, C: 15, D: 10 }
const PROTOCOL_UNTIL_WEEK = 4

/** Workbook Part 1 table; a test checks these against the workbook text. */
const BASELINE: Record<string, { name: string; min: number; strict: boolean }> = {
  '1': { name: 'Pattern', min: 20, strict: false },
  '2': { name: 'Working memory', min: 20, strict: false },
  '3': { name: 'Abstraction', min: 25, strict: false },
  '4': { name: 'Hypothesis testing', min: 30, strict: false },
  '5': { name: 'Processing (timed)', min: 12, strict: true },
}

/** Final Examination: 85 minutes of work, hard limit 90; the section plan is soft (Part 3). */
const FINAL = {
  targetMin: 85,
  hardMin: 90,
  plan: [
    { label: 'Section A (Pattern) suggested end', atMin: 15 },
    { label: 'Section B (Abstraction) suggested end', atMin: 30 },
    { label: 'Section C (Working memory) suggested end', atMin: 45 },
    { label: 'Section D (Hypothesis) suggested end', atMin: 60 },
    { label: 'Section E (Integrated) suggested end', atMin: 85 },
  ],
}

function group(items: Item[], keyOf: (i: Item) => string): Map<string, Item[]> {
  const m = new Map<string, Item[]>()
  for (const it of items) {
    const k = keyOf(it)
    m.set(k, [...(m.get(k) ?? []), it])
  }
  return m
}

interface Limit {
  limitMin: number | null
  strict: boolean
  limitSource: LimitSource
}

/**
 * A Block's limit, in order of authority:
 * 1. Challenge and mock-exam Blocks read the minutes in their Day heading (soft).
 * 2. A limit label on the Block's first Item ("Primary (15 min)", "Secondary (5 min, strict)").
 * 3. A per-Item target on the first Item means no Block countdown.
 * 4. Weeks 1-4 fall back to the daily protocol (soft).
 * 5. Otherwise no limit: elapsed time only.
 * Drills labelled on a later Item ("Timed: 6 min strict") stay Item-level and never set the Block limit.
 */
export function deriveLimit(week: number, block: string, items: Item[], day: DayMeta | undefined): Limit {
  if ((block === 'challenge' || block === 'M') && day?.limitMin) {
    return { limitMin: day.limitMin, strict: false, limitSource: 'day-heading' }
  }
  const t = items[0]?.timing
  if (t?.kind === 'limit') return { limitMin: t.minutes, strict: t.strict, limitSource: 'label' }
  if (t?.kind === 'target') return { limitMin: null, strict: false, limitSource: 'item-targets' }
  if (week <= PROTOCOL_UNTIL_WEEK && PROTOCOL_MIN[block]) {
    return { limitMin: PROTOCOL_MIN[block], strict: false, limitSource: 'protocol' }
  }
  return { limitMin: null, strict: false, limitSource: 'none' }
}

function build(): BlockDef[] {
  const out: BlockDef[] = []

  const base = group(workbook.items.filter((i) => i.stage === 'baseline'), (i) => i.block)
  for (const [b, items] of [...base].sort()) {
    const meta = BASELINE[b]
    if (b === '2') {
      out.push({
        key: 'base:2span',
        stage: 'baseline',
        week: null,
        day: null,
        label: 'Baseline · Section 2A/2B',
        title: 'Span test (forward and backward)',
        itemIds: [],
        limitMin: null,
        strict: false,
        hardLimitMin: null,
        limitSource: 'baseline',
        paceMarkers: [],
        units: 2,
        spanTest: true,
      })
    }
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
      hardLimitMin: null,
      limitSource: 'baseline',
      paceMarkers: [],
    })
  }

  for (const w of workbook.weeks) {
    for (const d of workbook.days.filter((x) => x.week === w.week)) {
      const items = workbook.items.filter((i) => i.week === w.week && i.day === d.day)
      const byBlock = group(items, (i) => i.block)
      for (const [b, its] of [...byBlock].sort()) {
        const lim = deriveLimit(w.week, b, its, d)
        out.push({
          key: `w${w.week}d${d.day}:${b}`,
          stage: 'week',
          week: w.week,
          day: d.day,
          label: `W${w.week} D${d.day} · ${BLOCK_NAME[b] ? `Block ${b}` : b === 'challenge' ? 'Weekly challenge' : b === 'M' ? 'Mock exam' : `Block ${b}`}`,
          title: BLOCK_NAME[b] ?? (b === 'challenge' ? 'Weekly challenge' : 'Timed mock exam'),
          itemIds: its.map((i) => i.id),
          ...lim,
          hardLimitMin: null,
          paceMarkers: [],
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
    title: `Final Examination (${FINAL.targetMin} min, hard limit ${FINAL.hardMin})`,
    itemIds: workbook.items.filter((i) => i.stage === 'final').map((i) => i.id),
    limitMin: FINAL.targetMin,
    strict: true,
    hardLimitMin: FINAL.hardMin,
    limitSource: 'final',
    paceMarkers: FINAL.plan,
  })
  return out
}

export const blocks: BlockDef[] = build()
export const blockByKey = new Map(blocks.map((b) => [b.key, b]))
export const itemById = new Map(workbook.items.map((i) => [i.id, i]))

/** The minute at which a strict clock freezes the Timed answer. */
export function freezeMin(def: BlockDef): number | null {
  return def.strict ? (def.hardLimitMin ?? def.limitMin) : null
}

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
