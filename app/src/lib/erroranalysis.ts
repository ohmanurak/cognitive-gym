import { blockStatus, firstAttempt } from './metrics'
import type { State } from './store'
import { blocks, itemById, type BlockDef } from './structure'

export interface ErrorAnalysis {
  week: number
  day: number
  /** Item ids of first-attempt misses (scored below full points). */
  misses: string[]
  /** Misses with no Error code yet. */
  uncoded: string[]
  /** Misses with no non-empty Fix yet. */
  unfixed: string[]
  /** Every Block of the Day is done (committed and scored). */
  blocksDone: boolean
  /** Step complete: Blocks done and every miss has an Error code and a Fix. */
  complete: boolean
}

export function dayBlocks(week: number, day: number): BlockDef[] {
  return blocks.filter((b) => b.week === week && b.day === day)
}

/**
 * Error analysis for a Day. Days 1-5 use it as a required step; Day 6 (weekly
 * challenge) calls the same function as the first step of the week-end
 * (hook for the reflection ticket). Con/Car and failed assumption are optional.
 */
export function errorAnalysis(s: State, week: number, day: number): ErrorAnalysis {
  const defs = dayBlocks(week, day)
  const misses: string[] = []
  const uncoded: string[] = []
  const unfixed: string[] = []
  for (const d of defs) {
    for (const id of d.itemIds) {
      const a = firstAttempt(s, id)
      const points = itemById.get(id)?.points ?? 0
      if (!a || a.score == null || a.score >= points) continue
      misses.push(id)
      if (!a.errorCode) uncoded.push(id)
      if (!a.fix || !a.fix.trim()) unfixed.push(id)
    }
  }
  const blocksDone = defs.length > 0 && defs.every((d) => blockStatus(s, d) === 'done')
  const complete = blocksDone && uncoded.length === 0 && unfixed.length === 0
  return { week, day, misses, uncoded, unfixed, blocksDone, complete }
}

/** Days 1-5 carry the step as a progress unit; Day 6 is handled at week-end. */
export function hasErrorStep(day: number | null): day is number {
  return day != null && day >= 1 && day <= 5
}

/** Distinct [week, day] step units among the given Blocks (Days 1-5 only). */
export function stepUnits(defs: BlockDef[]): { week: number; day: number }[] {
  const seen = new Map<string, { week: number; day: number }>()
  for (const d of defs) {
    if (d.week != null && hasErrorStep(d.day)) seen.set(`${d.week}:${d.day}`, { week: d.week, day: d.day })
  }
  return [...seen.values()]
}

/** A Day is complete when all its Blocks are done AND the step is complete. */
export function dayComplete(s: State, week: number, day: number): boolean {
  const ea = errorAnalysis(s, week, day)
  return hasErrorStep(day) ? ea.complete : ea.blocksDone
}

/** First Block of the Day that still holds a miss needing a code or Fix. */
export function firstOpenMissBlock(s: State, week: number, day: number): BlockDef | undefined {
  const ea = errorAnalysis(s, week, day)
  if (!ea.blocksDone || ea.complete) return undefined
  const open = new Set([...ea.uncoded, ...ea.unfixed])
  return dayBlocks(week, day).find((d) => d.itemIds.some((id) => open.has(id)))
}

const WEAK_PHRASES = ['be careful', 'double-check', 'double check', 'pay attention', 'try harder']

/** Soft hint for a weak Fix; null when fine. Never blocks saving. */
export function weakFixHint(fix: string | undefined): string | null {
  const t = (fix ?? '').trim()
  if (!t) return null
  const low = t.toLowerCase()
  if (t.length < 12 || WEAK_PHRASES.some((p) => low.includes(p))) {
    return 'Weak Fix? Name a concrete strategy or check, not "be careful".'
  }
  return null
}
