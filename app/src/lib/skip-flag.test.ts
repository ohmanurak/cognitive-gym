import { describe, expect, it } from 'vitest'
import { calibrationOf } from './metrics'
import { commitBlock, itemReady, skipScore, toggleSkip } from './state'
import type { State } from './store'

const empty = (): State => ({ attempts: {}, drafts: {}, blocks: {}, spans: [], reflections: {} })

describe('skip flag', () => {
  it('toggles on and off without touching the answer', () => {
    const s1 = toggleSkip(empty(), 'W1D1-A1')
    expect(s1.drafts['W1D1-A1']).toEqual({ answer: '', confidence: 0, skipped: true })
    const s2 = toggleSkip(s1, 'W1D1-A1')
    expect(s2.drafts['W1D1-A1'].skipped).toBe(false)
    expect(s2.drafts['W1D1-A1'].answer).toBe('')
  })

  it('flagged blank is commit-ready, unflagged blank is not', () => {
    expect(itemReady(undefined)).toBe(false)
    expect(itemReady({ answer: '', confidence: 0 })).toBe(false)
    expect(itemReady({ answer: '5', confidence: 0 })).toBe(false)
    expect(itemReady({ answer: '5', confidence: 3 })).toBe(true)
    expect(itemReady({ answer: '', confidence: 0, skipped: true })).toBe(true)
    expect(itemReady({ answer: '', confidence: 0, skipped: false })).toBe(false)
  })

  it('flagged blank scores zero at commit; anything else is left to score', () => {
    expect(skipScore({ answer: '', confidence: 0, skipped: true })).toBe(0)
    expect(skipScore({ answer: '7', confidence: 0, skipped: true })).toBeNull()
    expect(skipScore({ answer: '', confidence: 0 })).toBeNull()
    expect(skipScore(undefined)).toBeNull()
  })

  it('commitBlock keeps the flag on the Attempt and scores a blank zero', () => {
    const s = commitBlock(toggleSkip(empty(), 'W1D1-A1'), 'w1d1:A', ['W1D1-A1'], 1000)
    expect(s.attempts['W1D1-A1'][0]).toMatchObject({ answer: '', confidence: 0, skipped: true, score: 0 })
  })

  it('flagged Items are absent from Calibration', () => {
    const s = empty()
    s.attempts['W1D1-A1'] = [{ round: 1, answer: '', confidence: 4, skipped: true, score: 0 }]
    expect(calibrationOf(s)).toEqual(calibrationOf(empty()))
    s.attempts['W1D1-A1'] = [{ round: 1, answer: '1', confidence: 4, score: 0 }]
    expect(calibrationOf(s)).not.toEqual(calibrationOf(empty()))
  })
})
