import { useSyncExternalStore } from 'react'
import * as core from './state'
import type { LadderStep, SpanTestKind } from './spantest'
import type { Attempt, Draft, SpanTry, State } from './state'
import { markChanged } from './backupMeta'
import { SCHEMA_VERSION, workbookFingerprint } from './integrity'
import { applyMerge, planMerge, type MergePlan } from './merge'
import { blocks, workbook } from './structure'

// Types and pure helpers stay importable from here so callers do not change.
export { ERROR_CODES, blockState, elapsedNow, newBlockState } from './state'
export type { Attempt, BlockState, Draft, ErrorCode, SpanTry, State } from './state'

/** Thin wrapper: browser storage, subscriptions and the real clock. All logic lives in `state.ts`. */
const KEY = 'cognitive-gym:v1'

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...core.emptyState(), ...JSON.parse(raw) }
  } catch {
    /* storage unavailable or corrupt: start empty */
  }
  return core.emptyState()
}

let state: State = load()
const listeners = new Set<() => void>()

function commit(next: State) {
  if (next === state) return
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* quota or private mode: keep in memory only */
  }
  markChanged()
  listeners.forEach((l) => l())
}

export const getState = () => state

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const actions = {
  setDraft: (itemId: string, patch: Partial<Draft>) => commit(core.setDraft(state, itemId, patch)),
  toggleSkip: (itemId: string) => commit(core.toggleSkip(state, itemId)),
  startClock: (key: string) => commit(core.startClock(state, key, Date.now())),
  pauseClock: (key: string) => commit(core.pauseClock(state, key, Date.now())),
  snapshotOvertime: (key: string, itemIds: string[]) => commit(core.snapshotOvertime(state, key, itemIds)),
  commitBlock: (key: string, itemIds: string[], suggestFor?: (id: string, answer: string) => Attempt['suggestion']) =>
    commit(core.commitBlock(state, key, itemIds, Date.now(), suggestFor)),
  focusItem: (key: string, itemId: string | null) => commit(core.focusItemIn(state, key, itemId, Date.now())),
  mark: (itemId: string, patch: Partial<Attempt>) => commit(core.mark(state, itemId, patch)),
  retryBlock: (key: string) => commit(core.retryBlock(state, key)),
  addSpan: (t: SpanTry) => commit(core.addSpan(state, t)),
  startSpanTest: (kind: SpanTestKind) => {
    const id = `span-${Date.now()}`
    commit(core.startSpanTest(state, id, kind, Date.now()))
    return id
  },
  addSpanTrial: (id: string, step: LadderStep, response: string) => commit(core.addSpanTrial(state, id, step, response, Date.now())),
  abandonSpanTests: () => {
    const next = core.abandonSpanTests(state)
    if (next !== state) commit(next)
  },
  setWeekAnswer: (week: number, index: number, text: string) => commit(core.setWeekAnswer(state, week, index, text)),
  setReflection: (id: string, text: string) => commit(core.setReflection(state, id, text)),

  exportJson(): string {
    return JSON.stringify(
      { app: 'cognitive-gym', version: 1, schemaVersion: SCHEMA_VERSION, workbookFingerprint: workbookFingerprint(workbook.items), state },
      null,
      2,
    )
  },

  importJson(text: string) {
    const parsed = JSON.parse(text)
    if (parsed?.app !== 'cognitive-gym' || !parsed.state) throw new Error('Not a Cognitive Gym export')
    commit({ ...core.emptyState(), ...parsed.state })
  },

  /** Parse an export and plan a per-Block merge. Changes nothing. */
  planImport(text: string): { incoming: State; plan: MergePlan } {
    const parsed = JSON.parse(text)
    if (parsed?.app !== 'cognitive-gym' || !parsed.state) throw new Error('Not a Cognitive Gym export')
    const incoming: State = { ...core.emptyState(), ...parsed.state }
    return { incoming, plan: planMerge(state, incoming, Object.fromEntries(blocks.map((b) => [b.key, b.itemIds]))) }
  },

  applyImport(incoming: State, plan: MergePlan) {
    commit(applyMerge(state, incoming, plan))
  },

  reset() {
    commit(core.emptyState())
  },
}
