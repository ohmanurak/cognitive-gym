import type { Item, Skill } from '../parser/parseWorkbook'
import { dimsTotal, hasRubric } from './rubric'
import { calibration, efficiency, isProvisional, patternIndex, rubricIndex } from './indices'
import { errorAnalysis, firstOpenMissBlock, stepUnits } from './erroranalysis'
import { wmiFor } from './wmi'
import { weekEnd, weekEndUnits } from './weekend'
import { stageEnd } from './stageend'
import { baselineSpanDone } from './spantest'
import { blocks, itemById, type BlockDef } from './structure'
import { blockState, type Attempt, type ErrorCode, type SpanTry, type State } from './state'

export type Status = 'todo' | 'in-progress' | 'committed' | 'done'

export function latestAttempt(s: State, id: string): Attempt | undefined {
  const list = s.attempts[id]
  return list?.[list.length - 1]
}

export function firstAttempt(s: State, id: string): Attempt | undefined {
  return s.attempts[id]?.find((a) => a.round === 1)
}

export function blockStatus(s: State, def: BlockDef): Status {
  if (def.spanTest) {
    if (baselineSpanDone(s.spanTests)) return 'done'
    return s.spanTests.some((t) => t.kind === 'baseline') ? 'in-progress' : 'todo'
  }
  const b = blockState(s, def.key)
  if (b.committed) {
    const allScored = def.itemIds.every((id) => latestAttempt(s, id)?.score != null)
    return allScored ? 'done' : 'committed'
  }
  const started =
    b.startedAt !== null ||
    b.elapsedMs > 0 ||
    def.itemIds.some((id) => (s.drafts[id]?.answer ?? '') !== '') ||
    def.itemIds.some((id) => (s.attempts[id]?.length ?? 0) > 0)
  return started ? 'in-progress' : 'todo'
}

export interface Progress {
  blocksDone: number
  blocksTotal: number
  itemsDone: number
  itemsTotal: number
  /** Day error-analysis steps (Days 1-5); one unit per Day, also counted in blocksDone/blocksTotal. */
  stepsDone: number
  stepsTotal: number
  /** Week-end units (Day 6 error analysis + reflection); one per Week, also counted in blocksDone/blocksTotal. */
  weekEndsDone: number
  weekEndsTotal: number
}

export function progressOf(s: State, defs: BlockDef[]): Progress {
  let blocksDone = 0
  let itemsDone = 0
  let itemsTotal = 0
  for (const d of defs) {
    itemsTotal += d.itemIds.length + (d.units ?? 0)
    if (blockStatus(s, d) === 'done') blocksDone++
    if (d.units && blockStatus(s, d) === 'done') itemsDone += d.units
    itemsDone += d.itemIds.filter((id) => latestAttempt(s, id)?.score != null).length
  }
  const units = stepUnits(defs)
  const stepsDone = units.filter((u) => errorAnalysis(s, u.week, u.day).complete).length
  // One week-end unit (Day 6 error analysis + reflection) per Week.
  const weeks = weekEndUnits(defs)
  const weekEndsDone = weeks.filter((w) => weekEnd(s, w).complete).length
  // Baseline and Final each add one unit: error analysis + 4-question reflection.
  const stages = (['baseline', 'final'] as const).filter((k) => defs.some((d) => d.stage === k))
  const stagesDone = stages.filter((k) => stageEnd(s, k).complete).length
  return {
    blocksDone: blocksDone + stepsDone + weekEndsDone + stagesDone,
    blocksTotal: defs.length + units.length + weeks.length + stages.length,
    weekEndsDone,
    weekEndsTotal: weeks.length,
    itemsDone,
    itemsTotal,
    stepsDone,
    stepsTotal: units.length,
  }
}

/** First block in workbook order that is not finished, or holds a miss awaiting error analysis. */
export function nextUp(s: State): BlockDef | undefined {
  for (const [i, b] of blocks.entries()) {
    if (blockStatus(s, b) !== 'done') return b
    const last = blocks[i + 1]?.week !== b.week || blocks[i + 1]?.day !== b.day
    if (last && b.week != null && b.day != null) {
      const open = firstOpenMissBlock(s, b.week, b.day)
      if (open) return open
    }
  }
  return undefined
}

export type Scope = { kind: 'baseline' } | { kind: 'week'; week: number } | { kind: 'final' }

export function scopeBlocks(scope: Scope): BlockDef[] {
  return blocks.filter((b) =>
    scope.kind === 'week' ? b.week === scope.week : b.stage === scope.kind,
  )
}

/** Block key for each Item id. */
const blockOf = new Map<string, string>(blocks.flatMap((b) => b.itemIds.map((id) => [id, b.key] as const)))

interface Scored {
  item: Item
  attempt: Attempt
}

/** Scored first attempts in scope. Retries are excluded (the Key has been seen). */
export function scoredFirstAttempts(s: State, scope: Scope): Scored[] {
  const out: Scored[] = []
  for (const def of scopeBlocks(scope)) {
    for (const id of def.itemIds) {
      const a = firstAttempt(s, id)
      if (a && a.score != null) out.push({ item: itemById.get(id)!, attempt: a })
    }
  }
  return out
}

export interface SkillRow {
  skill: Skill
  score: number
  possible: number
  accuracy: number | null
}

const SKILLS: Skill[] = ['PD', 'AB', 'WM', 'HT', 'PE', 'IR']

export function skillRows(scored: Scored[]): SkillRow[] {
  return SKILLS.map((skill) => {
    const rows = scored.filter((r) => r.item.skill === skill)
    const score = rows.reduce((a, r) => a + (r.attempt.score ?? 0), 0)
    const possible = rows.reduce((a, r) => a + r.item.points, 0)
    return { skill, score, possible, accuracy: possible ? (score / possible) * 100 : null }
  })
}

/** Minutes and target minutes for first-round commits of blocks containing the skill. */
function timing(s: State, scope: Scope, skill: Skill): { actual: number; target: number } {
  let actual = 0
  let target = 0
  for (const def of scopeBlocks(scope)) {
    const b = blockState(s, def.key)
    const ms = b.roundElapsed[0]
    if (ms == null || def.limitMin == null) continue
    if (!def.itemIds.some((id) => itemById.get(id)!.skill === skill)) continue
    actual += ms / 60000
    target += def.limitMin
  }
  return { actual, target }
}

export function longestReliableSpan(spans: SpanTry[], direction: SpanTry['direction']): number {
  const byLen = new Map<number, boolean[]>()
  for (const t of spans.filter((x) => x.direction === direction)) {
    byLen.set(t.length, [...(byLen.get(t.length) ?? []), t.correct])
  }
  let best = 0
  for (const [len, tries] of byLen) {
    const last2 = tries.slice(-2)
    if (last2.length === 2 && last2.every(Boolean)) best = Math.max(best, len)
  }
  return best
}

export interface ScopeStats {
  scored: number
  accuracy: number | null
  skills: SkillRow[]
  PI: number | null
  AI: number | null
  WMI: number | null
  /** Only one Item class present; weights renormalised. */
  WMIProvisional?: boolean
  HI: number | null
  EI: number | null
  /** Items behind each Index, and whether that is under its threshold. */
  n: { PI: number; AI: number; HI: number; EI: number }
  provisional: { PI: boolean; AI: boolean; HI: boolean; EI: boolean }
  dominantError: ErrorCode | null
}

export function scopeStats(s: State, scope: Scope): ScopeStats {
  const scored = scoredFirstAttempts(s, scope)
  const skills = skillRows(scored)
  const possible = skills.reduce((a, r) => a + r.possible, 0)
  const score = skills.reduce((a, r) => a + r.score, 0)

  const pdN = scored.filter((r) => r.item.skill === 'PD').length
  const pd = skills.find((r) => r.skill === 'PD')!
  let PI: number | null = null
  if (pd.accuracy != null) {
    const t = timing(s, scope, 'PD')
    PI = t.actual > 0 ? patternIndex(pd.accuracy, t.target, t.actual) : pd.accuracy * 0.7
  }

  let aiN = 0
  let hiN = 0
  const rubric = (skill: Skill) => {
    // Open Items with complete dimensions only; objective and undimensioned Items are ignored.
    const totals = scored
      .filter((r) => r.item.skill === skill && hasRubric(r.item))
      .map((r) => dimsTotal(r.attempt.dims))
      .filter((n): n is number => n != null)
    if (skill === 'AB') aiN = totals.length
    else hiN = totals.length
    return rubricIndex(totals)
  }

  const pe = scored.filter((r) => r.item.skill === 'PE')
  // Efficiency = correct Processing Items / summed per-Item time of those Items (first round).
  const peMin =
    pe.reduce((a, r) => a + (blockState(s, blockOf.get(r.item.id)!).roundItemMs?.[0]?.[r.item.id] ?? 0), 0) / 60000
  const EI = pe.length ? efficiency(pe.filter((r) => r.attempt.score === r.item.points).length, peMin) : null

  const wmi = wmiFor(s, scope)

  const counts = new Map<ErrorCode, number>()
  for (const r of scored) {
    if (r.attempt.errorCode) counts.set(r.attempt.errorCode, (counts.get(r.attempt.errorCode) ?? 0) + 1)
  }
  const dominantError = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return {
    scored: scored.length,
    accuracy: possible ? (score / possible) * 100 : null,
    skills,
    PI,
    AI: rubric('AB'),
    HI: rubric('HT'),
    WMI: wmi?.WMI ?? null,
    WMIProvisional: wmi?.provisional,
    EI,
    n: { PI: pdN, AI: aiN, HI: hiN, EI: pe.length },
    provisional: {
      PI: isProvisional('PI', pdN),
      AI: isProvisional('AI', aiN),
      HI: isProvisional('HI', hiN),
      EI: isProvisional('EI', pe.length),
    },
    dominantError,
  }
}

export function calibrationOf(s: State) {
  const all: { confidence: number; correct: boolean }[] = []
  for (const def of blocks) {
    for (const id of def.itemIds) {
      const a = firstAttempt(s, id)
      if (a && a.score != null && !a.skipped && a.confidence > 0) {
        all.push({ confidence: a.confidence, correct: a.score === itemById.get(id)!.points })
      }
    }
  }
  return calibration(all)
}
