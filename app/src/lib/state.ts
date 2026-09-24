/**
 * Practice state and its transitions. Everything here is a pure function of
 * (state, input, now): no browser storage, no subscriptions, no real clock.
 * `store.ts` wraps these with persistence and React subscriptions.
 */

import { closeStretch, focusItem } from './itemtime'

export type ErrorCode = 'P' | 'R' | 'A' | 'WM' | 'H' | 'L' | 'C' | 'S' | 'K'
export const ERROR_CODES: { code: ErrorCode; name: string }[] = [
  { code: 'P', name: 'Perception / missed pattern' },
  { code: 'R', name: 'Representation error' },
  { code: 'A', name: 'Abstraction failure' },
  { code: 'WM', name: 'Working-memory failure' },
  { code: 'H', name: 'Hypothesis failure' },
  { code: 'L', name: 'Logic error' },
  { code: 'C', name: 'Calculation error' },
  { code: 'S', name: 'Speed / processing error' },
  { code: 'K', name: 'Knowledge gap' },
]

export interface Attempt {
  round: number
  answer: string
  confidence: number
  /** Skip flag: excluded from Calibration; stays visible after Commit. */
  skipped?: boolean
  /** Answer as it stood when a strict clock ran out (the `T` mark). */
  atTimeout?: string
  score: number | null
  /** Score of the Untimed answer, only set when it differs from T; `score` stays the Timed score. */
  untimedScore?: number | null
  /** Rubric dimensions (open AB/HT Items): five 0-2 scores, null = unset. */
  dims?: (number | null)[]
  errorCode?: ErrorCode
  nature?: 'Con' | 'Car'
  assumption?: string
  fix?: string
}

export interface BlockState {
  round: number
  committed: boolean
  /** Running-clock start (epoch ms) or null when paused. */
  startedAt: number | null
  /** Accumulated ms for the current round, excluding the running stretch. */
  elapsedMs: number
  snapshot: Record<string, string> | null
  /** Elapsed ms recorded at each commit, index = round - 1. */
  roundElapsed: number[]
  /** Commit date (epoch ms) recorded at each commit, index = round - 1. */
  committedAt: number[]
  /** Focused ms per Item this round, excluding the open stretch (see itemtime.ts). */
  itemMs: Record<string, number>
  /** itemMs recorded at each commit, index = round - 1. */
  roundItemMs: Record<string, number>[]
  /** Item currently focused, and since when (epoch ms). */
  focus: { itemId: string; since: number } | null
}

export interface SpanTry {
  at: number
  direction: 'forward' | 'backward'
  length: number
  correct: boolean
}

export interface Draft {
  answer: string
  confidence: number
  skipped?: boolean
}

export interface State {
  attempts: Record<string, Attempt[]>
  drafts: Record<string, Draft>
  blocks: Record<string, BlockState>
  spans: SpanTry[]
  reflections: Record<string, string>
}

export const emptyState = (): State => ({ attempts: {}, drafts: {}, blocks: {}, spans: [], reflections: {} })

export const newBlockState = (): BlockState => ({
  round: 1,
  committed: false,
  startedAt: null,
  elapsedMs: 0,
  snapshot: null,
  roundElapsed: [],
  committedAt: [],
  itemMs: {},
  roundItemMs: [],
  focus: null,
})

export function blockState(s: State, key: string): BlockState {
  return { ...newBlockState(), ...s.blocks[key] }
}

export function elapsedNow(b: BlockState, now: number): number {
  return b.elapsedMs + (b.startedAt !== null ? now - b.startedAt : 0)
}

function patchBlock(s: State, key: string, patch: Partial<BlockState>): State {
  return { ...s, blocks: { ...s.blocks, [key]: { ...blockState(s, key), ...patch } } }
}

export function setDraft(s: State, itemId: string, patch: Partial<Draft>): State {
  const cur = s.drafts[itemId] ?? { answer: '', confidence: 0 }
  return { ...s, drafts: { ...s.drafts, [itemId]: { ...cur, ...patch } } }
}

/** Toggle the Skip flag on an Item's draft. Never touches the answer. */
export function toggleSkip(s: State, itemId: string): State {
  const cur = s.drafts[itemId] ?? { answer: '', confidence: 0 }
  return { ...s, drafts: { ...s.drafts, [itemId]: { ...cur, skipped: !cur.skipped } } }
}

/** An Item may be committed when flagged, or when it has an answer and a confidence. */
export function itemReady(d: Draft | undefined): boolean {
  if (!d) return false
  return !!d.skipped || (d.answer.trim() !== '' && d.confidence > 0)
}

/** A flagged blank has nothing to score: it counts zero at Commit. Otherwise scored later. */
export function skipScore(d: Draft | undefined): number | null {
  return d?.skipped && d.answer.trim() === '' ? 0 : null
}

export function startClock(s: State, key: string, now: number): State {
  const b = blockState(s, key)
  if (b.startedAt !== null || b.committed) return s
  return patchBlock(s, key, { startedAt: now })
}

export function pauseClock(s: State, key: string, now: number): State {
  const b = blockState(s, key)
  if (b.startedAt === null) return s
  return patchBlock(s, key, { ...closeStretch(b, now), startedAt: null, elapsedMs: elapsedNow(b, now) })
}

/** Freeze the answers as they stand when a strict clock expires (the `T` mark). Only the first freeze counts. */
export function snapshotOvertime(s: State, key: string, itemIds: string[]): State {
  const b = blockState(s, key)
  if (b.snapshot) return s
  const snapshot: Record<string, string> = {}
  for (const id of itemIds) snapshot[id] = s.drafts[id]?.answer ?? ''
  return patchBlock(s, key, { snapshot })
}

/** Lock answers and confidence for every Item in the Block, record when, and unlock the Key. */
export function commitBlock(s: State, key: string, itemIds: string[], now: number): State {
  const b = blockState(s, key)
  if (b.committed) return s
  const attempts = { ...s.attempts }
  const drafts = { ...s.drafts }
  for (const id of itemIds) {
    const d = drafts[id]
    attempts[id] = [
      ...(attempts[id] ?? []),
      {
        round: b.round,
        answer: d?.answer ?? '',
        confidence: d?.confidence ?? 0,
        atTimeout: b.snapshot ? b.snapshot[id] : undefined,
        skipped: d?.skipped || undefined,
        score: skipScore(d),
      },
    ]
    delete drafts[id]
  }
  const elapsed = elapsedNow(b, now)
  const roundElapsed = [...b.roundElapsed]
  roundElapsed[b.round - 1] = elapsed
  const closed = closeStretch(b, now)
  const roundItemMs = [...b.roundItemMs]
  roundItemMs[b.round - 1] = closed.itemMs
  const committedAt = [...b.committedAt]
  committedAt[b.round - 1] = now
  return patchBlock({ ...s, attempts, drafts }, key, {
    committed: true,
    startedAt: null,
    elapsedMs: elapsed,
    roundElapsed,
    committedAt,
    itemMs: closed.itemMs,
    roundItemMs,
    focus: null,
  })
}

/** Score or annotate the most recent attempt of an Item. */
export function mark(s: State, itemId: string, patch: Partial<Attempt>): State {
  const list = s.attempts[itemId]
  if (!list?.length) return s
  const last = { ...list[list.length - 1], ...patch }
  return { ...s, attempts: { ...s.attempts, [itemId]: [...list.slice(0, -1), last] } }
}

/** Start another round of a Block. Retries never affect Indices (first attempt only). */
export function retryBlock(s: State, key: string): State {
  const b = blockState(s, key)
  return patchBlock(s, key, { round: b.round + 1, committed: false, startedAt: null, elapsedMs: 0, snapshot: null, itemMs: {}, focus: null })
}

/** Focus an Item (null = none); time accrues to it while the Block clock runs. */
export function focusItemIn(s: State, key: string, itemId: string | null, now: number): State {
  const b = blockState(s, key)
  if (b.committed) return s
  return patchBlock(s, key, focusItem(b, itemId, now))
}

export function addSpan(s: State, t: SpanTry): State {
  return { ...s, spans: [...s.spans, t] }
}

export function setReflection(s: State, id: string, text: string): State {
  return { ...s, reflections: { ...s.reflections, [id]: text } }
}
