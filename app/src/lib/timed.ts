import type { Attempt, State } from './state'

/** True when the Untimed answer differs from the Timed answer (T), after trimming, so a second score is needed. */
export function needsUntimedScore(a: Pick<Attempt, 'answer' | 'atTimeout'>): boolean {
  return a.atTimeout !== undefined && a.atTimeout.trim() !== a.answer.trim()
}

/** Score of the Untimed answer: its own score when it differs from T, otherwise the Timed score. */
export function untimedScoreOf(a: Attempt): number | null {
  return needsUntimedScore(a) ? (a.untimedScore ?? null) : a.score
}

export interface BlockTotals {
  timed: number
  untimed: number
  /** untimed - timed: points recovered by finishing after the clock. */
  gap: number
  /** True once every Item has the scores it needs. */
  complete: boolean
}

/** Timed and untimed totals for the latest round of a Block's Items. */
export function blockTotals(s: State, itemIds: string[]): BlockTotals {
  let timed = 0
  let untimed = 0
  let complete = itemIds.length > 0
  for (const id of itemIds) {
    const list = s.attempts[id]
    const a = list?.[list.length - 1]
    const u = a ? untimedScoreOf(a) : null
    if (!a || a.score == null || u == null) {
      complete = false
      continue
    }
    timed += a.score
    untimed += u
  }
  return { timed, untimed, gap: untimed - timed, complete }
}
