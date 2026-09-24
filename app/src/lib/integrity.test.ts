import { describe, expect, it } from 'vitest'
import {
  emptyMeta,
  findOrphans,
  fingerprintMatches,
  REMIND_AFTER_MS,
  shouldRemind,
  weeksCompleted,
  workbookFingerprint,
} from './integrity'
import type { State } from './store'

const items = [
  { id: 'A1', skill: 'Pattern', points: 2 },
  { id: 'A2', skill: 'Logic', points: 3 },
]

const state = (over: Partial<State> = {}): State => ({
  attempts: {
    A1: [{ round: 1, answer: 'x', confidence: 1, score: null }],
    OLD: [{ round: 1, answer: 'kept', confidence: 2, score: null }],
  },
  drafts: { GONE: { answer: 'd', confidence: 0 } },
  blocks: { 'b-old': { round: 1, committed: false, startedAt: null, elapsedMs: 0, snapshot: null, roundElapsed: [] } },
  spans: [],
  reflections: {},
  ...over,
})

describe('fingerprint', () => {
  it('is stable and order independent', () => {
    expect(workbookFingerprint(items)).toBe(workbookFingerprint([...items].reverse()))
  })
  it('changes on id, skill or points change', () => {
    const base = workbookFingerprint(items)
    expect(workbookFingerprint([{ ...items[0], id: 'A9' }, items[1]])).not.toBe(base)
    expect(workbookFingerprint([{ ...items[0], skill: 'Logic' }, items[1]])).not.toBe(base)
    expect(workbookFingerprint([{ ...items[0], points: 5 }, items[1]])).not.toBe(base)
  })
  it('old data without a fingerprint is unknown, not mismatched', () => {
    expect(fingerprintMatches(undefined, 'abc')).toBeNull()
    expect(fingerprintMatches('abc', 'abc')).toBe(true)
    expect(fingerprintMatches('abd', 'abc')).toBe(false)
  })
})

describe('findOrphans', () => {
  it('reports unmatched data and does not mutate state', () => {
    const s = state()
    const before = JSON.stringify(s)
    const o = findOrphans(s, ['A1', 'A2'], ['b-new'])
    expect(o.attempts).toEqual([{ itemId: 'OLD', round: 1, answer: 'kept' }])
    expect(o.drafts).toEqual([{ itemId: 'GONE', answer: 'd' }])
    expect(o.blocks).toEqual(['b-old'])
    expect(o.count).toBe(3)
    expect(JSON.stringify(s)).toBe(before)
  })
  it('finds nothing when all ids match; renamed id orphans its attempts', () => {
    expect(findOrphans(state({ drafts: {}, blocks: {} }), ['A1', 'OLD']).count).toBe(0)
    expect(findOrphans(state({ drafts: {}, blocks: {} }), ['A1', 'OLD2']).attempts[0].itemId).toBe('OLD')
  })
  it('loads old state shapes without fields', () => {
    expect(findOrphans({} as State, ['A1']).count).toBe(0)
  })
})

describe('reminder rule', () => {
  const t0 = 1_000_000
  it('7 day boundary is strictly older than 7 days', () => {
    const m = { ...emptyMeta(), firstUnsavedAt: t0 }
    expect(shouldRemind(m, t0 + REMIND_AFTER_MS, 0)).toBe(false)
    expect(shouldRemind(m, t0 + REMIND_AFTER_MS + 1, 0)).toBe(true)
  })
  it('nothing unsaved means no reminder', () => {
    expect(shouldRemind(emptyMeta(), t0 * 1000, 0)).toBe(false)
  })
  it('a Week completed since the last export triggers it', () => {
    const m = { ...emptyMeta(), weeksAtExport: 1 }
    expect(shouldRemind(m, t0, 1)).toBe(false)
    expect(shouldRemind(m, t0, 2)).toBe(true)
  })
  it('counts only fully complete weeks', () => {
    expect(
      weeksCompleted([
        { week: 1, complete: true },
        { week: 1, complete: true },
        { week: 2, complete: true },
        { week: 2, complete: false },
      ]),
    ).toBe(1)
  })
})
