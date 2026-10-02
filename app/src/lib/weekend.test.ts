import { describe, expect, it } from 'vitest'
import { dayBlocks } from './erroranalysis'
import { progressOf } from './metrics'
import { emptyState, setWeekAnswer, type Attempt, type ErrorCode, type State } from './state'
import { blocks, workbook } from './structure'
import { daysTrained, reflectionQuestions, restDay, weekComplete, weekEnd, weekEndFocus } from './weekend'

const W = 1

/** Commit every Block of the Week at the given time and score every Item full (99), except optional Day 6 miss. */
function finishedWeek(day6Miss = false, at = 1_000): State {
  const s = emptyState()
  for (const d of blocks.filter((b) => b.week === W)) {
    s.blocks[d.key] = { round: 1, committed: true, startedAt: null, elapsedMs: 0, snapshot: null, roundElapsed: [1000], committedAt: [at] } as never
    for (const id of d.itemIds) {
      s.attempts[id] = [{ round: 1, answer: 'x', confidence: 3, score: 99 } as Attempt]
    }
  }
  if (day6Miss) s.attempts[dayBlocks(W, 6)[0].itemIds[0]][0].score = 0
  return s
}

const strategyIdx = () => reflectionQuestions(W).length - 1

describe('week-end', () => {
  it('Week is complete only with a non-empty strategy answer', () => {
    let s = finishedWeek()
    expect(weekComplete(s, W)).toBe(false)
    s = setWeekAnswer(s, W, 0, 'P errors')
    expect(weekComplete(s, W)).toBe(false) // other answers do not count
    s = setWeekAnswer(s, W, strategyIdx(), '   ')
    expect(weekComplete(s, W)).toBe(false)
    s = setWeekAnswer(s, W, strategyIdx(), 'State the invariant first')
    expect(weekComplete(s, W)).toBe(true)
  })

  it('Day 6 error step gates the Week', () => {
    let s = setWeekAnswer(finishedWeek(true), W, strategyIdx(), 'Check parity')
    const id = dayBlocks(W, 6)[0].itemIds[0]
    expect(weekEnd(s, W).errors.uncoded).toEqual([id])
    expect(weekComplete(s, W)).toBe(false)
    expect(restDay(s, W)).toBe(false)
    s.attempts[id][0].errorCode = 'P'
    expect(weekComplete(s, W)).toBe(false) // still no Fix
    s.attempts[id][0].fix = 'Write the differences before guessing'
    expect(weekComplete(s, W)).toBe(true)
    expect(restDay(s, W)).toBe(true)
  })

  it('counts one week-end progress unit per Week', () => {
    const defs = blocks.filter((b) => b.week === W)
    const p0 = progressOf(finishedWeek(), defs)
    expect(p0.weekEndsTotal).toBe(1)
    expect(p0.weekEndsDone).toBe(0)
    const s = setWeekAnswer(finishedWeek(), W, strategyIdx(), 'x')
    const p1 = progressOf(s, defs)
    expect(p1.weekEndsDone).toBe(1)
    expect(p1.blocksDone).toBe(p1.blocksTotal)
    // A Day-only slice carries no week-end unit.
    expect(progressOf(s, dayBlocks(W, 1)).weekEndsTotal).toBe(0)
  })

  it('old saved data without weekReflections loads as no answers', () => {
    const old = { ...emptyState(), weekReflections: undefined } as unknown as State
    expect(weekEnd(old, W).reflection).toBe(false)
  })
})

describe('days trained', () => {
  const local = (d: number, h: number, m: number) => new Date(2026, 0, d, h, m).getTime()
  const withCommits = (times: number[]) => {
    const s = emptyState()
    const week = blocks.filter((b) => b.week === W)
    times.forEach((t, i) => {
      s.blocks[week[i].key] = { round: 1, committed: true, committedAt: [t] } as never
    })
    return s
  }

  it('counts distinct local calendar days across midnight', () => {
    expect(daysTrained(withCommits([local(5, 23, 59), local(6, 0, 1)]), W)).toBe(2)
    expect(daysTrained(withCommits([local(5, 0, 0), local(5, 23, 59), local(5, 12, 0)]), W)).toBe(1)
  })

  it('counts every round and ignores other Weeks', () => {
    const s = withCommits([local(5, 10, 0)])
    const week = blocks.filter((b) => b.week === W)
    s.blocks[week[0].key].committedAt = [local(5, 10, 0), local(7, 10, 0)]
    const other = blocks.find((b) => b.week === 2)!
    s.blocks[other.key] = { round: 1, committed: true, committedAt: [local(9, 10, 0)] } as never
    expect(daysTrained(s, W)).toBe(2)
    expect(daysTrained(emptyState(), W)).toBe(0)
  })
})

/** Score `n` unused Items of a Week as full misses with the given Error code (and Fix). */
function miss(s: State, week: number, n: number, code: ErrorCode, fix?: string): State {
  const ids = workbook.items.filter((i) => i.stage === 'week' && i.week === week && !s.attempts[i.id]).slice(0, n)
  for (const i of ids) s.attempts[i.id] = [{ round: 1, answer: 'x', confidence: 3, score: 0, errorCode: code, fix } as Attempt]
  return s
}

describe('week-end Top Focus', () => {
  it('is the top Focus as of the Week being closed; later Weeks are ignored', () => {
    const s = miss(miss(emptyState(), 1, 3, 'K'), 2, 6, 'R')
    expect(weekEndFocus(s, 1).focus?.code).toBe('K')
    expect(weekEndFocus(s, 2).focus?.code).toBe('R')
  })

  it('calls out a Fix not working, but only once the recurrence is within the Week being closed', () => {
    const s = miss(miss(emptyState(), 1, 3, 'K', 'Look up the definition first'), 2, 1, 'K')
    expect(weekEndFocus(s, 1).callout).toBeNull()
    expect(weekEndFocus(s, 2).callout).toBe("Your Fix for K didn't stop it. Rewrite the strategy, don't repeat it.")
  })

  it('quotes the Workbook line when the dominant error has held for 3+ Weeks up to the Week being closed', () => {
    let s = emptyState()
    for (const w of [1, 2, 3]) s = miss(s, w, 1, 'H')
    s = miss(s, 4, 2, 'P')
    expect(weekEndFocus(s, 2).callout).toBeNull()
    expect(weekEndFocus(s, 3).callout).toBe(
      'Dominant error H for 3 Weeks in a row: your strategy is not changing; rewrite it explicitly.',
    )
    expect(weekEndFocus(s, 4).callout).toBeNull()
  })

  it('Fix not working takes priority over a repeated dominant error', () => {
    let s = miss(emptyState(), 1, 1, 'H', 'Write two rival hypotheses')
    for (const w of [2, 3]) s = miss(s, w, 1, 'H')
    expect(weekEndFocus(s, 3).callout).toBe("Your Fix for H didn't stop it. Rewrite the strategy, don't repeat it.")
  })

  it('nothing ranks: no Top Focus and no call-out', () => {
    const s = miss(emptyState(), 1, 2, 'K')
    expect(weekEndFocus(s, 1)).toEqual({ focus: null, callout: null })
  })
})
