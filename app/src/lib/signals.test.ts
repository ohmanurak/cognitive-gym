import { describe, expect, it } from 'vitest'
import { repeatedDominantError, speedUpAccuracyDown, weekSignal } from './signals'
import type { ErrorCode, State } from './store'
import { blocks } from './structure'

const empty = (): State => ({ attempts: {}, drafts: {}, blocks: {}, spans: [], spanTests: [], reflections: {} })
const dom = (codes: (ErrorCode | null)[]) => codes.map((c, i) => ({ week: i + 1, dominantError: c }))

describe('repeatedDominantError', () => {
  it('fires at three consecutive Weeks with the same code', () => {
    expect(repeatedDominantError(dom(['H', 'H', 'H']))).toEqual({ code: 'H', weeks: [1, 2, 3] })
  })
  it('not at two Weeks, or when broken by another code or a gap', () => {
    expect(repeatedDominantError(dom(['H', 'H']))).toBeNull()
    expect(repeatedDominantError(dom(['H', 'H', 'P', 'H']))).toBeNull()
    expect(repeatedDominantError(dom(['H', 'H', null, 'H']))).toBeNull()
  })
  it('reports the latest run', () => {
    expect(repeatedDominantError(dom(['P', 'P', 'P', 'H', 'H', 'H', 'H']))).toEqual({ code: 'H', weeks: [4, 5, 6, 7] })
  })
})

describe('speedUpAccuracyDown', () => {
  const r = (week: number, speed: number | null, accuracy: number | null) => ({ week, speed, accuracy })
  it('fires when speed rises and accuracy falls', () => {
    expect(speedUpAccuracyDown([r(1, 1, 80), r(2, 1.4, 70)])).toEqual({ fromWeek: 1, toWeek: 2 })
  })
  it('not when both rise, speed falls, or data is missing', () => {
    expect(speedUpAccuracyDown([r(1, 1, 70), r(2, 1.4, 80)])).toBeNull()
    expect(speedUpAccuracyDown([r(1, 1.4, 80), r(2, 1, 70)])).toBeNull()
    expect(speedUpAccuracyDown([r(1, 1, 80), r(2, null, 70)])).toBeNull()
    expect(speedUpAccuracyDown([r(1, 1, 80)])).toBeNull()
  })
  it('compares the two most recent Weeks with data', () => {
    expect(speedUpAccuracyDown([r(1, 1, 90), r(2, 2, 80), r(3, null, null), r(4, 1, 70)])).toBeNull()
  })
})

describe('weekSignal', () => {
  it('is empty with no data', () => {
    expect(weekSignal(empty(), 1)).toMatchObject({
      errors: 0,
      conceptualPct: null,
      blockD: null,
      calibrationGap: null,
      speed: null,
    })
  })

  it('splits conceptual vs careless, Block D vs A-C, and the calibration gap', () => {
    const s = empty()
    const a = blocks.find((b) => b.key === 'w1d1:A')!.itemIds[0]
    const d = blocks.find((b) => b.key === 'w1d1:D')!.itemIds[0]
    s.attempts[a] = [{ round: 1, answer: 'x', confidence: 5, score: 0, errorCode: 'H' }]
    s.attempts[d] = [{ round: 1, answer: 'x', confidence: 1, score: 0, errorCode: 'C' }]
    const w = weekSignal(s, 1)
    expect(w.errors).toBe(2)
    expect(w.conceptualPct).toBe(50)
    expect(w.carelessPct).toBe(50)
    expect(w.blockABC).toBe(0)
    expect(w.blockD).toBe(0)
    // expected (0.97 + 0.25) / 2 = 0.61 vs actual 0
    expect(w.calibrationGap).toBeCloseTo(61)
  })
})
