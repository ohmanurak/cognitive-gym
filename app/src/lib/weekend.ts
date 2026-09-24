/**
 * Week-end flow (pure): Day 6 error analysis first, then the Weekly reflection.
 * A Week is complete when all its Blocks are done, the Day 1-5 and Day 6 error
 * steps are complete, and the reflection has a non-empty strategy-change answer.
 */
import { dayComplete, errorAnalysis, type ErrorAnalysis } from './erroranalysis'
import { firstAttempt, scopeStats, type ScopeStats } from './metrics'
import type { State } from './state'
import { blockState } from './state'
import { blocks, itemById, workbook, type BlockDef } from './structure'

export const WEEK_END_DAY = 6

/** The workbook's reflection questions for a Week, in order; the last is the strategy one. */
export function reflectionQuestions(week: number): string[] {
  return workbook.reflections?.find((r) => r.week === week)?.questions ?? []
}

/** Saved answers, one per question (missing = blank). */
export function reflectionAnswers(s: State, week: number): string[] {
  const saved = s.weekReflections?.[week] ?? []
  return reflectionQuestions(week).map((_, i) => saved[i] ?? '')
}

/** The strategy-change answer is the one required answer; the other questions may stay blank. */
export function reflectionSaved(s: State, week: number): boolean {
  const a = reflectionAnswers(s, week)
  return a.length > 0 && a[a.length - 1].trim() !== ''
}

export interface WeekEnd {
  week: number
  /** Step 1: Day 6 error analysis. */
  errors: ErrorAnalysis
  /** Step 2: reflection with a strategy sentence. */
  reflection: boolean
  /** Both steps done. */
  complete: boolean
}

export function weekEnd(s: State, week: number): WeekEnd {
  const errors = errorAnalysis(s, week, WEEK_END_DAY)
  const reflection = reflectionSaved(s, week)
  return { week, errors, reflection, complete: errors.complete && reflection }
}

/** Weeks whose week-end counts as a progress unit among the given Blocks (those holding a Day 6 Block). */
export function weekEndUnits(defs: BlockDef[]): number[] {
  return [...new Set(defs.filter((d) => d.week != null && d.day === WEEK_END_DAY).map((d) => d.week!))]
}

export function weekComplete(s: State, week: number): boolean {
  const days = [1, 2, 3, 4, 5]
  return days.every((d) => dayComplete(s, week, d)) && weekEnd(s, week).complete
}

/** Distinct local calendar days on which a Block of the Week was committed. */
export function daysTrained(s: State, week: number): number {
  const days = new Set<string>()
  for (const def of blocks) {
    if (def.week !== week) continue
    for (const at of blockState(s, def.key).committedAt) {
      if (at == null) continue
      const d = new Date(at)
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
    }
  }
  return days.size
}

/** Once Day 6 (error step included) is complete, the Week's training is over. */
export function restDay(s: State, week: number): boolean {
  return errorAnalysis(s, week, WEEK_END_DAY).complete
}

export interface WeekScorecard {
  stats: ScopeStats
  /** Mean stated confidence (as %) and first-attempt accuracy (%) over rated, scored Items; gap = confidence - accuracy. */
  confidence: number | null
  accuracy: number | null
  gap: number | null
}

/** Auto-filled Scorecard for a Week; nothing here is typed by the user. */
export function weekScorecard(s: State, week: number): WeekScorecard {
  const stats = scopeStats(s, { kind: 'week', week })
  let n = 0
  let conf = 0
  let right = 0
  for (const def of blocks.filter((b) => b.week === week)) {
    for (const id of def.itemIds) {
      const a = firstAttempt(s, id)
      if (!a || a.score == null || a.skipped || a.confidence <= 0) continue
      n++
      conf += (a.confidence / 5) * 100
      if (a.score === itemById.get(id)!.points) right++
    }
  }
  const confidence = n ? conf / n : null
  const accuracy = n ? (right / n) * 100 : null
  return { stats, confidence, accuracy, gap: confidence != null && accuracy != null ? confidence - accuracy : null }
}
