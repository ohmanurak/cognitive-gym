import { useSyncExternalStore } from 'react'

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
  /** Answer as it stood when a strict clock ran out (the `T` mark). */
  atTimeout?: string
  score: number | null
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
}

export interface SpanTry {
  at: number
  direction: 'forward' | 'backward'
  length: number
  correct: boolean
}

export interface State {
  attempts: Record<string, Attempt[]>
  drafts: Record<string, { answer: string; confidence: number }>
  blocks: Record<string, BlockState>
  spans: SpanTry[]
  reflections: Record<string, string>
}

const KEY = 'cognitive-gym:v1'
const empty = (): State => ({ attempts: {}, drafts: {}, blocks: {}, spans: [], reflections: {} })

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...empty(), ...JSON.parse(raw) }
  } catch {
    /* storage unavailable or corrupt: start empty */
  }
  return empty()
}

let state: State = load()
const listeners = new Set<() => void>()

function commit(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* quota or private mode: keep in memory only */
  }
  listeners.forEach((l) => l())
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const newBlockState = (): BlockState => ({
  round: 1,
  committed: false,
  startedAt: null,
  elapsedMs: 0,
  snapshot: null,
  roundElapsed: [],
})

export function blockState(s: State, key: string): BlockState {
  return s.blocks[key] ?? newBlockState()
}

export function elapsedNow(b: BlockState, now = Date.now()): number {
  return b.elapsedMs + (b.startedAt ? now - b.startedAt : 0)
}

function patchBlock(s: State, key: string, patch: Partial<BlockState>): State {
  return { ...s, blocks: { ...s.blocks, [key]: { ...blockState(s, key), ...patch } } }
}

export const actions = {
  setDraft(itemId: string, patch: Partial<{ answer: string; confidence: number }>) {
    const cur = state.drafts[itemId] ?? { answer: '', confidence: 0 }
    commit({ ...state, drafts: { ...state.drafts, [itemId]: { ...cur, ...patch } } })
  },

  startClock(key: string) {
    const b = blockState(state, key)
    if (b.startedAt || b.committed) return
    commit(patchBlock(state, key, { startedAt: Date.now() }))
  },

  pauseClock(key: string) {
    const b = blockState(state, key)
    if (!b.startedAt) return
    commit(patchBlock(state, key, { startedAt: null, elapsedMs: elapsedNow(b) }))
  },

  /** Freeze the answers as they stand when a strict clock expires (the `T` mark). */
  snapshotOvertime(key: string, itemIds: string[]) {
    const b = blockState(state, key)
    if (b.snapshot) return
    const snapshot: Record<string, string> = {}
    for (const id of itemIds) snapshot[id] = state.drafts[id]?.answer ?? ''
    commit(patchBlock(state, key, { snapshot }))
  },

  /** Lock answers + confidence for every item in the block; unlocks the Key. */
  commitBlock(key: string, itemIds: string[]) {
    const b = blockState(state, key)
    if (b.committed) return
    const attempts = { ...state.attempts }
    const drafts = { ...state.drafts }
    for (const id of itemIds) {
      const d = drafts[id]
      attempts[id] = [
        ...(attempts[id] ?? []),
        {
          round: b.round,
          answer: d?.answer ?? '',
          confidence: d?.confidence ?? 0,
          atTimeout: b.snapshot ? b.snapshot[id] : undefined,
          score: null,
        },
      ]
      delete drafts[id]
    }
    const elapsed = elapsedNow(b)
    const roundElapsed = [...b.roundElapsed]
    roundElapsed[b.round - 1] = elapsed
    commit({
      ...patchBlock({ ...state, attempts, drafts }, key, {
        committed: true,
        startedAt: null,
        elapsedMs: elapsed,
        roundElapsed,
      }),
    })
  },

  mark(itemId: string, patch: Partial<Attempt>) {
    const list = state.attempts[itemId]
    if (!list?.length) return
    const last = { ...list[list.length - 1], ...patch }
    commit({ ...state, attempts: { ...state.attempts, [itemId]: [...list.slice(0, -1), last] } })
  },

  /** Start another round of a block. Retries never affect Indices (first attempt only). */
  retryBlock(key: string) {
    const b = blockState(state, key)
    commit(patchBlock(state, key, { round: b.round + 1, committed: false, startedAt: null, elapsedMs: 0, snapshot: null }))
  },

  addSpan(t: SpanTry) {
    commit({ ...state, spans: [...state.spans, t] })
  },

  setReflection(id: string, text: string) {
    commit({ ...state, reflections: { ...state.reflections, [id]: text } })
  },

  exportJson(): string {
    return JSON.stringify({ app: 'cognitive-gym', version: 1, state }, null, 2)
  },

  importJson(text: string) {
    const parsed = JSON.parse(text)
    if (parsed?.app !== 'cognitive-gym' || !parsed.state) throw new Error('Not a Cognitive Gym export')
    commit({ ...empty(), ...parsed.state })
  },

  reset() {
    commit(empty())
  },
}
