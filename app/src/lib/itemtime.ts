/**
 * Per-Item time. Time accrues to the focused Item only while the Block clock
 * runs. Pure functions of (BlockState, input, now); `state.ts` wires them in.
 */
import type { BlockState } from './state'

/** Soft nudge to consider the Skip flag, from Week 9 (ms of focused time). */
export const NUDGE_MS = 75_000
export const NUDGE_FROM_WEEK = 9
/** Weeks 5-6 Item targets flip to S when exceeded by more than this fraction. */
export const TARGET_OVERRUN = 0.5

type TimeFields = Pick<BlockState, 'startedAt' | 'itemMs' | 'focus'>

/** ms of the open focus stretch that counts: focused and the clock running. */
function openStretch(b: TimeFields, now: number): number {
  if (!b.focus || b.startedAt === null) return 0
  return Math.max(0, now - Math.max(b.focus.since, b.startedAt))
}

/** Accumulated ms for an Item in the current round, including the open stretch. */
export function itemMsNow(b: TimeFields, itemId: string, now: number): number {
  const base = b.itemMs[itemId] ?? 0
  return b.focus?.itemId === itemId ? base + openStretch(b, now) : base
}

/** Fold the open stretch into itemMs; focus stays but restarts from `now`. */
export function closeStretch(b: TimeFields, now: number): Pick<BlockState, 'itemMs' | 'focus'> {
  if (!b.focus) return { itemMs: b.itemMs, focus: null }
  const add = openStretch(b, now)
  const itemMs = add > 0 ? { ...b.itemMs, [b.focus.itemId]: (b.itemMs[b.focus.itemId] ?? 0) + add } : b.itemMs
  return { itemMs, focus: { itemId: b.focus.itemId, since: now } }
}

/** Focus an Item (or null for none): attributes elapsed time to the previous Item. */
export function focusItem(b: TimeFields, itemId: string | null, now: number): Pick<BlockState, 'itemMs' | 'focus'> {
  if (b.focus?.itemId === itemId) return { itemMs: b.itemMs, focus: b.focus }
  const closed = closeStretch(b, now)
  return { itemMs: closed.itemMs, focus: itemId === null ? null : { itemId, since: now } }
}

/** Weeks 5-6 target Items: over target by more than 50% (the `S` mark). */
export function overTarget(itemMs: number, minutes: number): boolean {
  return itemMs > minutes * 60_000 * (1 + TARGET_OVERRUN)
}

/** Skip nudge: Week 9 onwards, 75 s of focused time, still unanswered. */
export function shouldNudge(week: number | null, itemMs: number, answered: boolean): boolean {
  return week !== null && week >= NUDGE_FROM_WEEK && itemMs >= NUDGE_MS && !answered
}
