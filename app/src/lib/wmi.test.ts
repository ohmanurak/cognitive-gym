import { describe, expect, it } from 'vitest'
import { emptyState, type State } from './state'
import { itemById } from './structure'
import { LADDER_SIZE, buildLadder, expectedAnswer, recordTrial, startSpanTest } from './spantest'
import { isMultiStep, wmiFor } from './wmi'
import { scopeStats } from './metrics'

const W1 = { kind: 'week', week: 1 } as const
const M = 'W1D1-C1' // manipulation (no tag)
const STAR = 'W1D1-C2' // starred, not tagged multi-step
const BASE = 'B2-03' // tagged multi-step

/** Complete test finishing at `at`; backward rungs correct up to `backTo` (both attempts). */
function test(id: string, kind: 'baseline' | 'retest', at: number, backTo: number) {
  let t = startSpanTest(id, kind, at - 1)
  for (const step of buildLadder(kind)) {
    const ok = step.direction === 'forward' || step.length <= backTo
    t = recordTrial(t, step, ok ? expectedAnswer(step) : 'x', at)
  }
  expect(t.trials.length).toBe(LADDER_SIZE)
  return t
}

function stateWith(scores: Record<string, number>, commitAt: number | null, tests: ReturnType<typeof test>[]): State {
  const s = emptyState()
  for (const [id, score] of Object.entries(scores)) s.attempts[id] = [{ round: 1, answer: 'x', confidence: 3, score }]
  if (commitAt !== null) {
    s.blocks['w1d1:C'] = {
      round: 1,
      committed: true,
      startedAt: null,
      elapsedMs: 0,
      snapshot: null,
      roundElapsed: [1],
      committedAt: [commitAt],
      itemMs: {},
      roundItemMs: [],
    } as never
  }
  s.spanTests = tests
  return s
}

describe('multi-step default and override', () => {
  it('defaults to the workbook tag, star is not multi-step', () => {
    expect(itemById.get(BASE)!.multiStepTag).toBe(true)
    expect(itemById.get('B2-06')!.multiStepTag).toBe(true)
    expect(itemById.get(STAR)!.star).toBe(true)
    expect(itemById.get(STAR)!.multiStepTag).toBe(false)
    expect(isMultiStep(undefined, true)).toBe(true)
    expect(isMultiStep({ multiStep: false } as never, true)).toBe(false)
    expect(isMultiStep({ multiStep: true } as never, false)).toBe(true)
  })
})

describe('wmiFor', () => {
  const pts = (id: string) => itemById.get(id)!.points

  it('is null without a Span test', () => {
    expect(wmiFor(stateWith({ [M]: pts(M) }, 100, []), W1)).toBeNull()
    expect(scopeStats(stateWith({ [M]: pts(M) }, 100, []), W1).WMI).toBeNull()
  })

  it('renormalises onto the manipulation class and is provisional (star ignored)', () => {
    const s = stateWith({ [M]: pts(M), [STAR]: pts(STAR) }, 100, [test('a', 'baseline', 50, 7)])
    const r = wmiFor(s, W1)!
    expect(r.provisional).toBe(true)
    expect(r.WMI).toBeCloseTo(100 * (0.2 * 0.875 + 0.8), 6)
  })

  it('renormalises onto multi-step when only that class exists (override)', () => {
    const s = stateWith({ [M]: 0 }, 100, [test('a', 'baseline', 50, 7)])
    s.attempts[M][0].multiStep = true
    const r = wmiFor(s, W1)!
    expect(r.provisional).toBe(true)
    expect(r.WMI).toBeCloseTo(17.5, 6)
  })

  it('uses full weights when both classes exist', () => {
    const s = stateWith({ [M]: pts(M), [STAR]: 0 }, 100, [test('a', 'baseline', 50, 7)])
    s.attempts[STAR][0].multiStep = true
    const r = wmiFor(s, W1)!
    expect(r.provisional).toBe(false)
    expect(r.WMI).toBeCloseTo(57.5, 6)
  })

  it('a later retest never changes an earlier stage', () => {
    const base = test('a', 'baseline', 50, 4)
    const retest = test('b', 'retest', 500, 7)
    const scores = { [M]: pts(M) }
    const before = wmiFor(stateWith(scores, 100, [base]), W1)!.WMI
    const after = wmiFor(stateWith(scores, 100, [base, retest]), W1)!.WMI
    expect(after).toBe(before)
    const early = wmiFor(stateWith(scores, 1000, [base, retest]), W1)!.WMI
    expect(early).toBeGreaterThan(before)
  })
})
