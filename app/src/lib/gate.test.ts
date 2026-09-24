import { describe, expect, it } from 'vitest'
import { blockAccuracy, effectiveFreezeMin, effectiveLimit, gatedBlocks, speedCredit } from './gate'
import { emptyState, type State } from './state'
import { patternIndex } from './indices'
import { blockByKey, blocks, itemById, type BlockDef } from './structure'

const timed = (w: number) => blocks.filter((b) => b.stage === 'week' && b.week === w && b.limitMin !== null)
const totalPts = (d: BlockDef) => d.itemIds.reduce((a, id) => a + itemById.get(id)!.points, 0)

/** Score a Block's first round so accuracy equals pct (whole score on the first Item). */
function scored(s: State, d: BlockDef, pct: number, round = 1): State {
  const attempts = { ...s.attempts }
  d.itemIds.forEach((id, i) => {
    const score = i === 0 ? (totalPts(d) * pct) / 100 : 0
    attempts[id] = [...(attempts[id] ?? []), { round, answer: 'x', confidence: 3, score }]
  })
  return { ...s, attempts }
}

const w1 = timed(1)
const [prev, next] = [w1[0], w1[1]]

describe('accuracy gate', () => {
  it('speedCredit matches the patternIndex rule', () => {
    expect(speedCredit(74.9)).toBe(0)
    expect(speedCredit(75)).toBe(1)
    expect(patternIndex(74, 10, 5)).toBe(74 * 0.7)
    expect(patternIndex(75, 10, 5)).toBe(75 * 1)
  })

  it('blockAccuracy is overall, first round only, null until all scored', () => {
    expect(blockAccuracy(emptyState(), prev)).toBeNull()
    expect(blockAccuracy(scored(emptyState(), prev, 50), prev)).toBeCloseTo(50)
    const partial = scored(emptyState(), prev, 50)
    partial.attempts[prev.itemIds[0]][0].score = null
    expect(blockAccuracy(partial, prev)).toBeNull()
  })

  it('under 75% widens the next timed Block by 25% with a note', () => {
    const e = effectiveLimit(scored(emptyState(), prev, 74), next)
    expect(e.limitMin).toBe(next.limitMin! * 1.25)
    expect(e.widenedFrom).toBe(next.limitMin)
    expect(e.note).toBe(`Time widened by 25% because Block ${prev.label} scored under 75%`)
  })

  it('exactly 75% and over do not widen', () => {
    for (const pct of [75, 90, 100]) {
      const e = effectiveLimit(scored(emptyState(), prev, pct), next)
      expect(e).toEqual({ limitMin: next.limitMin, widenedFrom: null, note: null })
    }
  })

  it('only the next timed Block is widened, and the failed Block itself is not', () => {
    const s = scored(emptyState(), prev, 10)
    expect(effectiveLimit(s, prev).widenedFrom).toBeNull()
    expect(effectiveLimit(s, w1[2]).widenedFrom).toBeNull()
    expect(gatedBlocks(s)).toEqual([next.key])
  })

  it('carries across Day boundaries within a week', () => {
    const d1 = w1.filter((b) => b.day === 1)
    const first = w1.find((b) => b.day === 2)!
    const s = scored(emptyState(), d1[d1.length - 1], 10)
    expect(effectiveLimit(s, first).widenedFrom).toBe(first.limitMin)
  })

  it('no carry to the next week or when no timed Block follows', () => {
    const last = w1[w1.length - 1]
    const s = scored(emptyState(), last, 0)
    expect(gatedBlocks(s)).toEqual([])
    expect(effectiveLimit(s, timed(2)[0]).widenedFrom).toBeNull()
  })

  it('an unscored or uncommitted previous Block never triggers', () => {
    expect(effectiveLimit(emptyState(), next).widenedFrom).toBeNull()
    const s = scored(emptyState(), prev, 0)
    s.attempts[prev.itemIds[0]][0].score = null
    expect(effectiveLimit(s, next).widenedFrom).toBeNull()
  })

  it('retries are not counted', () => {
    // Round 1 passed, round 2 failed: no widening.
    let s = scored(emptyState(), prev, 100)
    s = scored(s, prev, 0, 2)
    expect(effectiveLimit(s, next).widenedFrom).toBeNull()
    // Round 1 failed, round 2 passed: still widened.
    s = scored(scored(emptyState(), prev, 0), prev, 100, 2)
    expect(effectiveLimit(s, next).widenedFrom).toBe(next.limitMin)
  })

  it('strict Block freezes at the widened limit; Final hard limit is unaffected', () => {
    const w = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap(timed)
    const i = w.findIndex((b, k) => b.strict && k > 0 && b.week === w[k - 1].week && b.hardLimitMin === null)
    const strict = w[i]
    const s = scored(emptyState(), w[i - 1], 0)
    expect(effectiveFreezeMin(s, strict)).toBe(strict.limitMin! * 1.25)
    expect(effectiveFreezeMin(emptyState(), strict)).toBe(strict.limitMin)
    expect(effectiveFreezeMin(emptyState(), prev)).toBeNull()
    const fin = blockByKey.get('final:exam')!
    expect(effectiveFreezeMin(scored(emptyState(), w[w.length - 1], 0), fin)).toBe(90)
    expect(effectiveLimit(scored(emptyState(), w[w.length - 1], 0), fin).widenedFrom).toBeNull()
  })
})
