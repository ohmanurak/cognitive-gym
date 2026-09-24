import { firstAttempt } from './metrics'
import { blocks, itemById, type BlockDef } from './structure'
import type { State } from './store'

/** Accuracy gate (Workbook 0.8): under this Block accuracy, speed earns nothing. */
export const GATE_PCT = 75
export const WIDEN_FACTOR = 1.25

/** Speed credit is 0 below the gate, else 1 (the S term may apply). */
export function speedCredit(accuracyPct: number): 0 | 1 {
  return accuracyPct >= GATE_PCT ? 1 : 0
}

/** A timed Block has a stated limit and belongs to a week (Final and Baseline are not week-scoped). */
export function isTimedWeekBlock(def: BlockDef): boolean {
  return def.stage === 'week' && def.limitMin !== null && !def.spanTest
}

/**
 * Overall Block accuracy in percent from first-attempt (round 1) Timed scores over the Block's points.
 * Null until every Item has a first-round score; retries never count.
 */
export function blockAccuracy(s: State, def: BlockDef): number | null {
  if (def.itemIds.length === 0) return null
  let got = 0
  let total = 0
  for (const id of def.itemIds) {
    const a = firstAttempt(s, id)
    if (!a || a.score == null) return null
    got += a.score
    total += itemById.get(id)?.points ?? 0
  }
  return total > 0 ? (got / total) * 100 : null
}

export interface EffectiveLimit {
  limitMin: number | null
  /** Original limit when widened, else null. */
  widenedFrom: number | null
  note: string | null
}

/**
 * Derived from state, never stored. A timed Block under 75% widens the next timed Block in workbook
 * order within the same week (+25%); Day boundaries within a week do not stop it. Only that one Block
 * is widened; nothing carries to another week or when no timed Block follows.
 */
export function effectiveLimit(s: State, def: BlockDef): EffectiveLimit {
  const plain = { limitMin: def.limitMin, widenedFrom: null, note: null }
  if (!isTimedWeekBlock(def)) return plain
  const timed = blocks.filter((b) => isTimedWeekBlock(b) && b.week === def.week)
  const prev = timed[timed.findIndex((b) => b.key === def.key) - 1]
  if (!prev) return plain
  const acc = blockAccuracy(s, prev)
  if (acc === null || acc >= GATE_PCT) return plain
  return {
    limitMin: def.limitMin! * WIDEN_FACTOR,
    widenedFrom: def.limitMin,
    note: `Time widened by 25% because Block ${prev.label} scored under ${GATE_PCT}%`,
  }
}

/** Keys of Blocks currently running on a widened limit. */
export function gatedBlocks(s: State): string[] {
  return blocks.filter((b) => effectiveLimit(s, b).widenedFrom !== null).map((b) => b.key)
}

/** Minute at which a strict Block freezes; uses the widened limit, hard limits (Final) are never widened. */
export function effectiveFreezeMin(s: State, def: BlockDef): number | null {
  if (!def.strict) return null
  return def.hardLimitMin ?? effectiveLimit(s, def).limitMin
}
