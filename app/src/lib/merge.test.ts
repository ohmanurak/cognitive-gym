import { describe, expect, it } from 'vitest'
import { applyMerge, planMerge } from './merge'
import { emptyState, newBlockState, type Attempt, type State } from './state'

const items = { A: ['a1', 'a2'], B: ['b1'] }
const att = (answer: string): Attempt => ({ round: 1, answer, confidence: 3, score: 1 })
const done = (at: number) => ({ ...newBlockState(), committed: true, committedAt: [at] })
const st = (p: Partial<State>): State => ({ ...emptyState(), ...p })
const merge = (l: State, i: State) => applyMerge(l, i, planMerge(l, i, items))

describe('per-Block merge', () => {
  it('later commit wins, as a unit', () => {
    const l = st({ blocks: { A: done(1) }, attempts: { a1: [att('old')], a2: [att('old2')] } })
    const i = st({ blocks: { A: done(2) }, attempts: { a1: [att('new')] } })
    const plan = planMerge(l, i, items)
    expect(plan).toMatchObject({ added: 0, replaced: 1, kept: 0 })
    const m = applyMerge(l, i, plan)
    expect(m.attempts.a1[0].answer).toBe('new')
    expect(m.attempts.a2).toBeUndefined()
    expect(m.blocks.A.committedAt).toEqual([2])
  })
  it('keeps local when local is newer', () => {
    const l = st({ blocks: { A: done(5) }, attempts: { a1: [att('loc')] } })
    const i = st({ blocks: { A: done(2) }, attempts: { a1: [att('inc')] } })
    expect(planMerge(l, i, items).kept).toBe(1)
    expect(merge(l, i).attempts.a1[0].answer).toBe('loc')
  })
  it('identical Blocks are ignored', () => {
    const s = st({ blocks: { A: done(1) }, attempts: { a1: [att('x')] } })
    const plan = planMerge(s, s, items)
    expect(plan).toMatchObject({ added: 0, replaced: 0, kept: 0 })
    expect(plan.actions.A).toBe('same')
  })
  it('a Block done on each side survives', () => {
    const l = st({ blocks: { A: done(1) }, attempts: { a1: [att('phone')] } })
    const i = st({ blocks: { B: done(2) }, attempts: { b1: [att('pc')] } })
    const m = merge(l, i)
    expect(m.attempts.a1[0].answer).toBe('phone')
    expect(m.attempts.b1[0].answer).toBe('pc')
    expect(Object.keys(m.blocks).sort()).toEqual(['A', 'B'])
  })
  it('local in-progress Block is untouched; incoming uncommitted ignored', () => {
    const busy = { ...newBlockState(), elapsedMs: 500 }
    const l = st({ blocks: { A: busy }, drafts: { a1: { answer: 'wip', confidence: 0 } } })
    const i = st({ blocks: { A: done(9), B: newBlockState() }, attempts: { a1: [att('inc')] } })
    const plan = planMerge(l, i, items)
    expect(plan.actions).toEqual({ A: 'busy' })
    const m = applyMerge(l, i, plan)
    expect(m.blocks.A).toBe(busy)
    expect(m.drafts.a1.answer).toBe('wip')
    expect(m.attempts.a1).toBeUndefined()
  })
  it('unions Span tests, spans and reflections', () => {
    const t = (id: string, startedAt: number) => ({ id, kind: 'baseline' as const, startedAt, finishedAt: null, trials: [] })
    const l = st({ spanTests: [t('s1', 1)], spans: [{ at: 1, direction: 'forward', length: 3, correct: true }], reflections: { w1: 'mine', w2: '' } })
    const i = st({ spanTests: [t('s1', 1), t('s2', 2)], spans: [{ at: 2, direction: 'forward', length: 4, correct: false }], reflections: { w1: 'theirs', w2: 'ok' } })
    const m = merge(l, i)
    expect(m.spanTests.map((x) => x.id)).toEqual(['s1', 's2'])
    expect(m.spans).toHaveLength(2)
    expect(m.reflections).toEqual({ w1: 'mine', w2: 'ok' })
  })
  it('does not mutate inputs', () => {
    const l = st({ blocks: { A: done(1) }, attempts: { a1: [att('o')] } })
    const i = st({ blocks: { A: done(2), B: done(2) }, attempts: { a1: [att('n')], b1: [att('b')] } })
    const before = JSON.stringify([l, i])
    merge(l, i)
    expect(JSON.stringify([l, i])).toBe(before)
  })
  it('keeps orphans from the incoming file', () => {
    const i = st({ blocks: { ZZ: done(3) }, attempts: { zz1: [att('old item')], a9: [att('orphan')] } })
    const m = merge(st({}), i)
    expect(m.blocks.ZZ).toBeDefined()
    expect(m.attempts.zz1).toBeDefined()
    expect(m.attempts.a9[0].answer).toBe('orphan')
  })
  it('cancel = no change (plan alone does not touch state)', () => {
    const l = st({ blocks: { A: done(1) } })
    const before = JSON.stringify(l)
    planMerge(l, st({ blocks: { B: done(2) } }), items)
    expect(JSON.stringify(l)).toBe(before)
  })
})
