import { describe, expect, it } from 'vitest'
import { commitBlock, emptyState, mark, setDraft, snapshotOvertime } from './state'
import { blockTotals, needsUntimedScore } from './timed'

const ids = ['a', 'b']

function run() {
  let s = emptyState()
  s = setDraft(s, 'a', { answer: 'x' })
  s = setDraft(s, 'b', { answer: 'y' })
  s = snapshotOvertime(s, 'K', ids) // clock ran out: T = x, y
  s = setDraft(s, 'a', { answer: 'x2' }) // edits after limit = U
  return commitBlock(s, 'K', ids, 1000)
}

describe('timed vs untimed', () => {
  it('freezes T at the limit and keeps later edits as the final answer', () => {
    const s = run()
    expect(s.attempts.a[0].atTimeout).toBe('x')
    expect(s.attempts.a[0].answer).toBe('x2')
    expect(s.attempts.b[0].atTimeout).toBe('y')
  })

  it('asks for a second score only when U differs from T', () => {
    const s = run()
    expect(needsUntimedScore(s.attempts.a[0])).toBe(true)
    expect(needsUntimedScore(s.attempts.b[0])).toBe(false)
    expect(needsUntimedScore({ answer: ' x ', atTimeout: 'x' })).toBe(false)
    expect(needsUntimedScore({ answer: 'x' })).toBe(false)
  })

  it('computes timed, untimed and gap; incomplete until scored', () => {
    let s = run()
    s = mark(s, 'a', { score: 0 })
    expect(blockTotals(s, ids).complete).toBe(false)
    s = mark(s, 'b', { score: 2 })
    expect(blockTotals(s, ids).complete).toBe(false) // a still needs its untimed score
    s = mark(s, 'a', { untimedScore: 3 })
    expect(blockTotals(s, ids)).toEqual({ timed: 2, untimed: 5, gap: 3, complete: true })
  })
})
