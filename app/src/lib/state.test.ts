import { describe, expect, it } from 'vitest'
import {
  blockState,
  commitBlock,
  elapsedNow,
  emptyState,
  mark,
  pauseClock,
  retryBlock,
  setDraft,
  snapshotOvertime,
  startClock,
  type State,
} from './state'

const KEY = 'w1d1:A'
const IDS = ['I1', 'I2']

function withDrafts(s: State = emptyState()): State {
  s = setDraft(s, 'I1', { answer: '79', confidence: 4 })
  return setDraft(s, 'I2', { answer: '720', confidence: 3 })
}

describe('drafts and Commit', () => {
  it('commit locks every draft into an attempt, clears drafts and records the commit date', () => {
    const s = commitBlock(withDrafts(), KEY, IDS, 5_000)
    const b = blockState(s, KEY)
    expect(b.committed).toBe(true)
    expect(b.committedAt).toEqual([5_000])
    expect(s.drafts).toEqual({})
    expect(s.attempts.I1).toEqual([{ round: 1, answer: '79', confidence: 4, atTimeout: undefined, score: null }])
    expect(s.attempts.I2[0].answer).toBe('720')
  })

  it('committing twice changes nothing (same state object)', () => {
    const once = commitBlock(withDrafts(), KEY, IDS, 5_000)
    expect(commitBlock(once, KEY, IDS, 9_000)).toBe(once)
    expect(blockState(once, KEY).committedAt).toEqual([5_000])
  })

  it('does not mutate the input state', () => {
    const before = withDrafts()
    const snapshot = JSON.stringify(before)
    commitBlock(before, KEY, IDS, 5_000)
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('clock with an injected time', () => {
  it('accumulates running time across pause and resume', () => {
    let s = startClock(emptyState(), KEY, 1_000)
    s = pauseClock(s, KEY, 4_000)
    expect(blockState(s, KEY).elapsedMs).toBe(3_000)
    s = startClock(s, KEY, 10_000)
    expect(elapsedNow(blockState(s, KEY), 12_500)).toBe(5_500)
  })

  it('starting a running or committed clock is a no-op', () => {
    const running = startClock(emptyState(), KEY, 1_000)
    expect(startClock(running, KEY, 2_000)).toBe(running)
    const done = commitBlock(withDrafts(), KEY, IDS, 3_000)
    expect(startClock(done, KEY, 4_000)).toBe(done)
  })

  it('commit stops the clock and records elapsed time for the round', () => {
    let s = startClock(withDrafts(), KEY, 1_000)
    s = commitBlock(s, KEY, IDS, 61_000)
    const b = blockState(s, KEY)
    expect(b.startedAt).toBeNull()
    expect(b.elapsedMs).toBe(60_000)
    expect(b.roundElapsed).toEqual([60_000])
  })
})

describe('time-out snapshot (T)', () => {
  it('freezes answers once; later edits do not change it; commit carries it to attempts', () => {
    let s = withDrafts()
    s = snapshotOvertime(s, KEY, IDS)
    s = setDraft(s, 'I1', { answer: '80' })
    expect(snapshotOvertime(s, KEY, IDS)).toBe(s)
    s = commitBlock(s, KEY, IDS, 1_000)
    expect(s.attempts.I1[0]).toMatchObject({ answer: '80', atTimeout: '79' })
  })
})

describe('marking and retries', () => {
  it('mark only touches the latest attempt', () => {
    let s = commitBlock(withDrafts(), KEY, IDS, 1_000)
    s = mark(s, 'I1', { score: 2 })
    s = retryBlock(s, KEY)
    s = setDraft(s, 'I1', { answer: 'x', confidence: 1 })
    s = setDraft(s, 'I2', { answer: 'y', confidence: 1 })
    s = commitBlock(s, KEY, IDS, 2_000)
    s = mark(s, 'I1', { score: 0 })
    expect(s.attempts.I1.map((a) => [a.round, a.score])).toEqual([
      [1, 2],
      [2, 0],
    ])
  })

  it('a retry starts a new round: uncommitted again, clock reset, first-round data kept', () => {
    let s = startClock(withDrafts(), KEY, 0)
    s = commitBlock(s, KEY, IDS, 30_000)
    s = retryBlock(s, KEY)
    const b = blockState(s, KEY)
    expect(b).toMatchObject({ round: 2, committed: false, elapsedMs: 0, startedAt: null, snapshot: null })
    expect(b.roundElapsed).toEqual([30_000])
    expect(b.committedAt).toEqual([30_000])
    expect(s.attempts.I1).toHaveLength(1)
  })

  it('mark on an Item with no attempt is a no-op', () => {
    const s = emptyState()
    expect(mark(s, 'nope', { score: 1 })).toBe(s)
  })
})

describe('older saved data', () => {
  it('blocks saved before committedAt existed still read as valid', () => {
    const s: State = {
      ...emptyState(),
      blocks: { [KEY]: { round: 1, committed: true, startedAt: null, elapsedMs: 0, snapshot: null, roundElapsed: [10] } as never },
    }
    expect(blockState(s, KEY).committedAt).toEqual([])
  })
})
