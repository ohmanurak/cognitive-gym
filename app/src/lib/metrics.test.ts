import { describe, expect, it } from 'vitest'
import { blockStatus, longestReliableSpan, nextUp, progressOf, scopeStats } from './metrics'
import type { State } from './store'
import { blockByKey, blocks } from './structure'

const empty = (): State => ({ attempts: {}, drafts: {}, blocks: {}, spans: [], spanTests: [], reflections: {} })

describe('structure', () => {
  it('orders baseline, 12 weeks, then the final exam', () => {
    expect(blocks[0].key).toBe('base:1')
    expect(blocks.at(-1)!.key).toBe('final:exam')
    expect(blockByKey.get('w1d1:A')!.itemIds).toEqual(['W1D1-A1'])
    expect(blockByKey.get('base:5')!.strict).toBe(true)
    expect(blockByKey.get('w9d1:A')!.strict).toBe(false)
    expect(blockByKey.get('w1d1:A')!.strict).toBe(false)
  })

  it('every item belongs to exactly one block', () => {
    const seen = blocks.flatMap((b) => b.itemIds)
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen.length).toBeGreaterThan(400)
  })
})

describe('progress', () => {
  it('starts with everything to do and points to the first block', () => {
    const s = empty()
    expect(nextUp(s)!.key).toBe('base:1')
    expect(blockStatus(s, blocks[0])).toBe('todo')
    expect(progressOf(s, blocks).itemsDone).toBe(0)
  })

  it('a block is done once committed and every item scored', () => {
    const def = blockByKey.get('w1d1:A')!
    const s = empty()
    s.blocks[def.key] = { round: 1, committed: true, startedAt: null, elapsedMs: 0, snapshot: null, roundElapsed: [1000], committedAt: [1000] }
    s.attempts['W1D1-A1'] = [{ round: 1, answer: '79', confidence: 4, score: null }]
    expect(blockStatus(s, def)).toBe('committed')
    s.attempts['W1D1-A1'][0].score = 3
    expect(blockStatus(s, def)).toBe('done')
    expect(progressOf(s, [def])).toMatchObject({ blocksDone: 1, itemsDone: 1, itemsTotal: 1, stepsTotal: 1, stepsDone: 0 })
  })
})

describe('stats', () => {
  it('uses first attempts only', () => {
    const def = blockByKey.get('w1d1:A')!
    const s = empty()
    s.blocks[def.key] = { round: 2, committed: true, startedAt: null, elapsedMs: 0, snapshot: null, roundElapsed: [60000, 30000], committedAt: [1, 2] }
    s.attempts['W1D1-A1'] = [
      { round: 1, answer: 'x', confidence: 5, score: 0, errorCode: 'P' },
      { round: 2, answer: '79', confidence: 5, score: 3 },
    ]
    const st = scopeStats(s, { kind: 'week', week: 1 })
    expect(st.accuracy).toBe(0)
    expect(st.dominantError).toBe('P')
  })

  it('AI and HI use dimension totals of open Items only', () => {
    const s = empty()
    const at = (score: number, dims?: number[]) => [{ round: 1, answer: 'x', confidence: 3, score, dims }]
    s.attempts['W1D2-D1'] = at(2, [2, 2, 2, 1, 1]) // open HT, total 8
    s.attempts['W1D4-C1'] = at(4) // open HT, no dims: ignored
    s.attempts['W1D3-B2'] = at(3, [0, 0, 0, 0, 0]) // objective AB: ignored
    const st = scopeStats(s, { kind: 'week', week: 1 })
    expect(st.HI).toBe(80)
    expect(st.AI).toBeNull()
  })

  it('needs two correct tries at a length for a reliable span', () => {
    const t = (length: number, correct: boolean) => ({ at: 0, direction: 'backward' as const, length, correct })
    expect(longestReliableSpan([t(4, true), t(4, true), t(5, true), t(5, false)], 'backward')).toBe(4)
    expect(longestReliableSpan([t(4, true)], 'backward')).toBe(0)
  })
})
