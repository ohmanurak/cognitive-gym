import { describe, expect, it } from 'vitest'
import { dayBlocks, firstOpenMissBlock, dayComplete, errorAnalysis, weakFixHint } from './erroranalysis'
import { progressOf } from './metrics'
import type { Attempt, State } from './store'

const empty = (): State => ({ attempts: {}, drafts: {}, blocks: {}, spans: [], reflections: {} })
const W = 1
const D = 1
const defs = () => dayBlocks(W, D)
const miss = () => defs()[0].itemIds[0]

/** Day fully committed; every item scored full points except the miss (score 0). */
function finished(withMiss: boolean): State {
  const s = empty()
  for (const d of defs()) {
    s.blocks[d.key] = { round: 1, committed: true, startedAt: null, elapsedMs: 0, snapshot: null, roundElapsed: [1000] }
    for (const id of d.itemIds) {
      const isMiss = withMiss && id === miss()
      s.attempts[id] = [{ round: 1, answer: 'x', confidence: 3, score: isMiss ? 0 : 99 } as Attempt]
    }
  }
  return s
}

describe('error analysis step', () => {
  it('incomplete with an uncoded miss', () => {
    const s = finished(true)
    const ea = errorAnalysis(s, W, D)
    expect(ea.uncoded).toEqual([miss()])
    expect(ea.complete).toBe(false)
    expect(dayComplete(s, W, D)).toBe(false)
  })

  it('incomplete with a code but no Fix (blank Fix too)', () => {
    const s = finished(true)
    s.attempts[miss()][0].errorCode = 'PM' as never
    expect(errorAnalysis(s, W, D).complete).toBe(false)
    s.attempts[miss()][0].fix = '   '
    expect(errorAnalysis(s, W, D).unfixed).toEqual([miss()])
  })

  it('complete with code and Fix; Con/Car and assumption optional', () => {
    const s = finished(true)
    Object.assign(s.attempts[miss()][0], { errorCode: 'PM', fix: 'List the rule before answering' })
    expect(errorAnalysis(s, W, D).complete).toBe(true)
    expect(dayComplete(s, W, D)).toBe(true)
  })

  it('auto-completes with no misses', () => {
    const ea = errorAnalysis(finished(false), W, D)
    expect(ea.misses).toEqual([])
    expect(ea.complete).toBe(true)
  })

  it('not complete while Blocks are unfinished', () => {
    const s = empty()
    expect(errorAnalysis(s, W, D).complete).toBe(false)
    expect(dayComplete(s, W, D)).toBe(false)
  })

  it('ignores retries: only the first attempt counts', () => {
    const s = finished(true)
    Object.assign(s.attempts[miss()][0], { errorCode: 'PM', fix: 'Check the rule on two examples' })
    s.attempts[miss()].push({ round: 2, answer: 'y', confidence: 3, score: 0 })
    expect(errorAnalysis(s, W, D).complete).toBe(true)
    // first-attempt success with a failed retry is not a miss
    const t = finished(false)
    t.attempts[miss()].push({ round: 2, answer: 'y', confidence: 3, score: 0 })
    expect(errorAnalysis(t, W, D).misses).toEqual([])
  })

  it('counts as one progress unit and steers nextUp to the open miss', () => {
    const s = finished(true)
    const p = progressOf(s, defs())
    expect(p.stepsTotal).toBe(1)
    expect(p.stepsDone).toBe(0)
    expect(p.blocksTotal).toBe(defs().length + 1)
    expect(firstOpenMissBlock(s, W, D)!.key).toBe(defs()[0].key)
  })
})

describe('weakFixHint', () => {
  it('flags short Fixes and vague phrases', () => {
    expect(weakFixHint('no')).not.toBeNull()
    expect(weakFixHint('Be careful next time around')).not.toBeNull()
    expect(weakFixHint('I will Double Check everything')).not.toBeNull()
    expect(weakFixHint('pay attention to the rule')).not.toBeNull()
    expect(weakFixHint('try harder on these ones')).not.toBeNull()
  })
  it('passes concrete Fixes and empty input', () => {
    expect(weakFixHint('Write the rule for each row before choosing')).toBeNull()
    expect(weakFixHint('')).toBeNull()
    expect(weakFixHint(undefined)).toBeNull()
  })
})
