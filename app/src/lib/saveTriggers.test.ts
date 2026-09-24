import { describe, expect, it } from 'vitest'
import * as core from './state'
import { blocks } from './structure'
import { saveMilestones } from './saveTriggers'
import { reflectionQuestions } from './weekend'

const def = blocks.find((b) => b.week != null && b.day != null && b.day <= 5)!

describe('save milestones', () => {
  it('empty state has none', () => {
    expect(saveMilestones(core.emptyState()).size).toBe(0)
  })
  it('Block Commit adds a milestone, and a retry commit adds another', () => {
    let s = core.commitBlock(core.emptyState(), def.key, def.itemIds, 1000)
    const one = saveMilestones(s)
    expect(one.size).toBeGreaterThan(0)
    s = core.commitBlock(core.retryBlock(s, def.key), def.key, def.itemIds, 2000)
    expect(saveMilestones(s).size).toBeGreaterThan(one.size)
  })
  it('drafts, clocks, focus, skips do not change milestones', () => {
    let s = core.emptyState()
    const base = [...saveMilestones(s)]
    s = core.setDraft(s, def.itemIds[0], { answer: 'x', confidence: 3 })
    s = core.toggleSkip(s, def.itemIds[0])
    s = core.startClock(s, def.key, 5)
    s = core.focusItemIn(s, def.key, def.itemIds[0], 6)
    s = core.snapshotOvertime(s, def.key, def.itemIds)
    s = core.pauseClock(s, def.key, 9)
    expect([...saveMilestones(s)]).toEqual(base)
  })
  it('Span test completion is a milestone; running or abandoned is not', () => {
    let s = core.startSpanTest(core.emptyState(), 'span-1', 'baseline', 1)
    expect(saveMilestones(s).size).toBe(0)
    const finished = { ...s.spanTests[0], finishedAt: 99 }
    expect([...saveMilestones({ ...s, spanTests: [finished] })]).toContain('span:span-1')
    s = core.abandonSpanTests(s)
    expect(saveMilestones(s).size).toBe(0)
  })
  it('week reflection is a milestone once the strategy answer is saved', () => {
    const w = def.week!
    const n = reflectionQuestions(w).length
    expect(n).toBeGreaterThan(0)
    const early = core.setWeekAnswer(core.emptyState(), w, 0, 'first')
    expect(saveMilestones(early).has(`reflection:week${w}`)).toBe(n === 1)
    const s = core.setWeekAnswer(core.emptyState(), w, n - 1, 'strategy')
    expect(saveMilestones(s).has(`reflection:week${w}`)).toBe(true)
  })
  it('stage reflection is a milestone once all 4 answers exist', () => {
    let s = core.emptyState()
    for (let i = 1; i <= 3; i++) s = core.setReflection(s, `baseline:${i}`, 'a')
    expect(saveMilestones(s).has('reflection:baseline')).toBe(false)
    s = core.setReflection(s, 'baseline:4', 'a')
    expect(saveMilestones(s).has('reflection:baseline')).toBe(true)
  })
})
