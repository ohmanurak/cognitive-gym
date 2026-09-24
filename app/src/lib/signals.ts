import { scopeBlocks, scopeStats, scoredFirstAttempts, type Scope } from './metrics'
import { blockState, type ErrorCode, type State } from './store'
import { itemById } from './structure'

/** Conceptual errors per the Workbook interpretation table; every other code is careless. */
export const CONCEPTUAL: ErrorCode[] = ['H', 'A', 'R', 'L']

/** Midpoints of the expected correct-rate bands for Confidence 1-5 (Calibration table). */
const EXPECTED = [0.25, 0.45, 0.65, 0.85, 0.97]

export interface WeekSignal {
  week: number
  /** Coded first-attempt misses in the Week. */
  errors: number
  /** Share of coded errors that are conceptual (0-100); null with no errors. */
  conceptualPct: number | null
  carelessPct: number | null
  /** Block D accuracy versus Blocks A-C accuracy (percent), the transfer check. */
  blockD: number | null
  blockABC: number | null
  /** Mean expected correct-rate minus actual correct-rate, in points; positive = overconfident. */
  calibrationGap: number | null
  dominantError: ErrorCode | null
  accuracy: number | null
  /** Scored Items per minute of first-round Block time; null without timed data. */
  speed: number | null
}

const pct = (score: number, possible: number) => (possible ? (score / possible) * 100 : null)

export function weekSignal(s: State, week: number): WeekSignal {
  const scope: Scope = { kind: 'week', week }
  const defs = scopeBlocks(scope)
  const scored = scoredFirstAttempts(s, scope)
  const st = scopeStats(s, scope)

  let conceptual = 0
  let careless = 0
  for (const r of scored) {
    const c = r.attempt.errorCode
    if (!c) continue
    if (CONCEPTUAL.includes(c)) conceptual++
    else careless++
  }
  const errors = conceptual + careless

  const letter = new Map(defs.flatMap((b) => b.itemIds.map((id) => [id, b.key.split(':')[1]] as const)))
  const acc = (rows: typeof scored) =>
    pct(
      rows.reduce((a, r) => a + (r.attempt.score ?? 0), 0),
      rows.reduce((a, r) => a + r.item.points, 0),
    )
  const d = scored.filter((r) => letter.get(r.item.id) === 'D')
  const abc = scored.filter((r) => ['A', 'B', 'C'].includes(letter.get(r.item.id) ?? ''))

  const rated = scored.filter((r) => !r.attempt.skipped && r.attempt.confidence > 0)
  let calibrationGap: number | null = null
  if (rated.length) {
    const expected = rated.reduce((a, r) => a + EXPECTED[r.attempt.confidence - 1], 0) / rated.length
    const actual = rated.filter((r) => r.attempt.score === itemById.get(r.item.id)!.points).length / rated.length
    calibrationGap = (expected - actual) * 100
  }

  let minutes = 0
  let items = 0
  for (const def of defs) {
    const ms = blockState(s, def.key).roundElapsed[0]
    if (ms == null || ms <= 0) continue
    minutes += ms / 60000
    items += def.itemIds.filter((id) => s.attempts[id]?.find((a) => a.round === 1)?.score != null).length
  }

  return {
    week,
    errors,
    conceptualPct: errors ? (conceptual / errors) * 100 : null,
    carelessPct: errors ? (careless / errors) * 100 : null,
    blockD: acc(d),
    blockABC: acc(abc),
    calibrationGap,
    dominantError: st.dominantError,
    accuracy: st.accuracy,
    speed: minutes > 0 && items > 0 ? items / minutes : null,
  }
}

export function weeklySignals(s: State): WeekSignal[] {
  return Array.from({ length: 12 }, (_, i) => weekSignal(s, i + 1))
}

export interface RepeatedError {
  code: ErrorCode
  /** Weeks of the latest run of three or more consecutive Weeks. */
  weeks: number[]
}

/** Latest run of 3+ consecutive Weeks (adjacent numbers) sharing the same dominant error. */
export function repeatedDominantError(rows: Pick<WeekSignal, 'week' | 'dominantError'>[]): RepeatedError | null {
  const sorted = [...rows].sort((a, b) => a.week - b.week)
  let best: RepeatedError | null = null
  let run: number[] = []
  let code: ErrorCode | null = null
  for (const r of sorted) {
    if (r.dominantError != null && r.dominantError === code && r.week === run[run.length - 1] + 1) {
      run.push(r.week)
    } else {
      code = r.dominantError
      run = r.dominantError ? [r.week] : []
    }
    if (code && run.length >= 3) best = { code, weeks: [...run] }
  }
  return best
}

export interface SpeedAccuracy {
  fromWeek: number
  toWeek: number
}

/** Speed rose while accuracy fell, comparing the two most recent Weeks that have both measures. */
export function speedUpAccuracyDown(
  rows: Pick<WeekSignal, 'week' | 'speed' | 'accuracy'>[],
): SpeedAccuracy | null {
  const known = rows.filter((r) => r.speed != null && r.accuracy != null).sort((a, b) => a.week - b.week)
  if (known.length < 2) return null
  const prev = known[known.length - 2]
  const last = known[known.length - 1]
  return last.speed! > prev.speed! && last.accuracy! < prev.accuracy!
    ? { fromWeek: prev.week, toWeek: last.week }
    : null
}
