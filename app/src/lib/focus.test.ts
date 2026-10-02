import { describe, expect, it } from 'vitest'
import { rankFocus } from './focus'
import { emptyState, type Attempt, type ErrorCode, type State } from './state'
import { workbook } from './structure'

interface Miss {
  id: string
  score: number
  code?: ErrorCode
  fix?: string
}

function stateWith(misses: Miss[]): State {
  const s = emptyState()
  for (const m of misses) {
    s.attempts[m.id] = [{ round: 1, answer: 'x', confidence: 3, score: m.score, errorCode: m.code, fix: m.fix } as Attempt]
  }
  return s
}

/** `n` unused Items from a Week with the given point value, each scored to lose `lost` points. */
const used = new Set<string>()
function misses(week: number, points: number, n: number, lost: number, code: ErrorCode | undefined, fix?: string): Miss[] {
  const ids = workbook.items
    .filter((i) => i.stage === 'week' && i.week === week && i.points === points && !used.has(i.id))
    .slice(0, n)
    .map((i) => i.id)
  if (ids.length < n) throw new Error(`only ${ids.length} unused ${points}-point Items in Week ${week}`)
  ids.forEach((id) => used.add(id))
  return ids.map((id) => ({ id, score: points - lost, code, fix }))
}

/** The learner's real Error log at the time of the prototype (Baseline + Week 1 Day 1). */
const REAL: Miss[] = [
  { id: 'B2-03', score: 0, code: 'S', fix: 'Rework again, i still got time' },
  { id: 'B3-01', score: 2, code: 'H', fix: 'reread the answer and write it down' },
  { id: 'B3-03', score: 0, code: 'K' },
  { id: 'B3-04', score: 2, code: 'WM', fix: 'find the pattern' },
  { id: 'B3-05', score: 0, code: 'K' },
  { id: 'B4-01', score: 3, code: 'R' },
  { id: 'B4-02', score: 3, code: 'R' },
  { id: 'B4-03', score: 0, code: 'K' },
  { id: 'B4-05', score: 2, code: 'R' },
  { id: 'B5-07', score: 0, code: 'S' },
  { id: 'B5-11', score: 0, code: 'S' },
  { id: 'W1D1-B2', score: 1, code: 'K' },
]

describe('rankFocus', () => {
  it('real data: Knowledge gaps rank first, then R and S; H and WM are Provisional', () => {
    const r = rankFocus(stateWith(REAL))
    expect(r.focus.map((f) => f.code)).toEqual(['K', 'R', 'S'])
    expect(r.provisional.map((f) => f.code).sort()).toEqual(['H', 'WM'])
    const k = r.focus[0]
    expect(k.misses).toBe(4)
    expect(k.pointsLost).toBe(13)
    expect(k.skills).toEqual({ AB: 2, HT: 1, PD: 1 })
    expect(k.weeks).toEqual([0, 1])
    expect(k.fixNotWorking).toBe(false)
  })

  it('careless flood: two big Hypothesis failures outrank eight 1-point Calculation slips', () => {
    const r = rankFocus(
      stateWith([
        ...misses(3, 3, 5, 1, 'C'),
        ...misses(4, 3, 3, 1, 'C'),
        ...misses(3, 4, 1, 4, 'H', 'List rival hypotheses before testing'),
        ...misses(4, 4, 2, 4, 'H'),
      ]),
    )
    expect(r.focus.map((f) => f.code)).toEqual(['H', 'C'])
  })

  it('old problem, solved: recent Representation errors outrank heavier but old Knowledge gaps', () => {
    const r = rankFocus(
      stateWith([
        ...misses(1, 4, 5, 4, 'K'),
        ...misses(2, 4, 1, 4, 'K'),
        ...misses(5, 4, 3, 3, 'R'),
        ...misses(6, 4, 1, 3, 'R'),
      ]),
    )
    expect(r.focus.map((f) => f.code)).toEqual(['R', 'K'])
  })

  it('Fix not working: a Logic error that recurs after its Fix jumps a slightly heavier Abstraction group', () => {
    const r = rankFocus(
      stateWith([
        ...misses(3, 2, 1, 2, 'L', 'Write each premise as an if-then before combining'),
        ...misses(4, 2, 1, 2, 'L'),
        ...misses(5, 2, 1, 2, 'L'),
        ...misses(3, 2, 1, 2, 'A'),
        ...misses(4, 2, 1, 2, 'A'),
        ...misses(5, 3, 1, 3, 'A'),
      ]),
    )
    expect(r.focus.map((f) => [f.code, f.fixNotWorking])).toEqual([
      ['L', true],
      ['A', false],
    ])
  })

  it('counts only coded first-attempt misses; uncoded ones are counted separately', () => {
    const s = stateWith([...misses(2, 3, 3, 1, 'P'), ...misses(2, 3, 2, 1, undefined)])
    // A miss on a retry round does not count when round 1 was right.
    const [retried] = misses(2, 3, 1, 0, 'P')
    s.attempts[retried.id] = [
      { round: 1, answer: 'x', confidence: 3, score: 3 } as Attempt,
      { round: 2, answer: 'y', confidence: 3, score: 0, errorCode: 'P' } as Attempt,
    ]
    const r = rankFocus(s)
    expect(r.focus.map((f) => [f.code, f.misses])).toEqual([['P', 3]])
    expect(r.uncoded).toBe(2)
  })

  it('as of a Week, later weeks are ignored', () => {
    const s = stateWith([...misses(7, 4, 3, 4, 'K'), ...misses(9, 4, 3, 3, 'R')])
    expect(rankFocus(s).focus.map((f) => f.code)).toEqual(['R', 'K'])
    expect(rankFocus(s, 8).focus.map((f) => f.code)).toEqual(['K'])
  })
})
