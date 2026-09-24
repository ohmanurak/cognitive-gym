import { describe, expect, it } from 'vitest'
import { derivedScore, dimsTotal, setDim } from './rubric'

describe('rubric derivation', () => {
  it('totals only when all five dimensions are set', () => {
    expect(dimsTotal([2, 2, 2, 2, 2])).toBe(10)
    expect(dimsTotal([2, 2, null, 2, 2])).toBeNull()
    expect(dimsTotal(undefined)).toBeNull()
  })

  it('derives points as round(points x total / 10)', () => {
    expect(derivedScore(5, 10)).toBe(5)
    expect(derivedScore(5, 0)).toBe(0)
    expect(derivedScore(5, 3)).toBe(2) // 1.5 rounds up
    expect(derivedScore(5, 2)).toBe(1)
    expect(derivedScore(5, 1)).toBe(1) // 0.5 rounds up
    expect(derivedScore(4, 6)).toBe(2) // 2.4
    expect(derivedScore(4, 7)).toBe(3) // 2.8
    expect(derivedScore(3, 8)).toBe(2) // 2.4
  })

  it('setDim yields a score only once complete', () => {
    let r = setDim(undefined, 0, 2, 5)
    expect(r.score).toBeNull()
    for (let i = 1; i < 5; i++) r = setDim(r.dims, i, 1, 5)
    expect(r.dims).toEqual([2, 1, 1, 1, 1])
    expect(r.score).toBe(3) // total 6 -> 3
  })
})
