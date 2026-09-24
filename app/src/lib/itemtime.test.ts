import { describe, expect, it } from 'vitest'
import { itemMsNow, overTarget, shouldNudge } from './itemtime'
import { blockState, commitBlock, emptyState, focusItemIn, pauseClock, retryBlock, startClock, setDraft } from './state'

const K = 'w9:1'
const ids = ['a', 'b']
const ms = (s: ReturnType<typeof emptyState>, id: string, now: number) => itemMsNow(blockState(s, K), id, now)

describe('per-Item time', () => {
  it('attributes elapsed time to the previously focused Item', () => {
    let s = startClock(emptyState(), K, 0)
    s = focusItemIn(s, K, 'a', 1000)
    s = focusItemIn(s, K, 'b', 4000)
    expect(ms(s, 'a', 6000)).toBe(3000)
    expect(ms(s, 'b', 6000)).toBe(2000)
  })

  it('records nothing while the clock is not running', () => {
    let s = focusItemIn(emptyState(), K, 'a', 0)
    expect(ms(s, 'a', 5000)).toBe(0)
    s = startClock(s, K, 5000)
    expect(ms(s, 'a', 7000)).toBe(2000)
  })

  it('pausing stops accrual and resuming continues', () => {
    let s = startClock(emptyState(), K, 0)
    s = focusItemIn(s, K, 'a', 0)
    s = pauseClock(s, K, 2000)
    expect(ms(s, 'a', 9000)).toBe(2000)
    s = startClock(s, K, 10000)
    expect(ms(s, 'a', 13000)).toBe(5000)
  })

  it('blur stops accrual', () => {
    let s = startClock(emptyState(), K, 0)
    s = focusItemIn(s, K, 'a', 0)
    s = focusItemIn(s, K, null, 1000)
    expect(ms(s, 'a', 9000)).toBe(1000)
  })

  it('commit closes the open stretch and keeps the round record; retry resets', () => {
    let s = startClock(emptyState(), K, 0)
    s = setDraft(s, 'a', { answer: 'x', confidence: 3 })
    s = focusItemIn(s, K, 'a', 500)
    s = commitBlock(s, K, ids, 2500)
    const b = blockState(s, K)
    expect(b.roundItemMs[0]).toEqual({ a: 2000 })
    expect(b.focus).toBeNull()
    expect(ms(s, 'a', 99999)).toBe(2000)
    s = retryBlock(s, K)
    expect(blockState(s, K).itemMs).toEqual({})
    expect(blockState(s, K).roundItemMs[0]).toEqual({ a: 2000 })
  })

  it('old saved blocks without the fields default', () => {
    const s = { ...emptyState(), blocks: { [K]: { round: 1, committed: false, startedAt: null, elapsedMs: 0, snapshot: null, roundElapsed: [], committedAt: [] } as never } }
    expect(blockState(s, K).itemMs).toEqual({})
    expect(blockState(s, K).focus).toBeNull()
  })
})

describe('thresholds', () => {
  it('overTarget is strictly more than +50%', () => {
    expect(overTarget(90_000, 1)).toBe(false)
    expect(overTarget(90_001, 1)).toBe(true)
  })
  it('nudge from Week 9 at 75 s while unanswered', () => {
    expect(shouldNudge(9, 75_000, false)).toBe(true)
    expect(shouldNudge(9, 74_999, false)).toBe(false)
    expect(shouldNudge(8, 200_000, false)).toBe(false)
    expect(shouldNudge(10, 200_000, true)).toBe(false)
    expect(shouldNudge(null, 200_000, false)).toBe(false)
  })
})
