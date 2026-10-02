import { describe, expect, it } from 'vitest'
import { newMissesSince } from './coach'
import { adoptFix, emptyState, type Attempt, type CoachingNote, type ErrorCode, type State } from './state'

const miss = (score: number | null, errorCode?: ErrorCode, extra: Partial<Attempt> = {}): Attempt[] => [
  { round: 1, answer: 'my answer', confidence: 3, score, errorCode, ...extra },
]
const st = (attempts: State['attempts']): State => ({ ...emptyState(), attempts })
const note = (basedOn: string[]): CoachingNote => ({
  createdAt: '2026-10-02T10:00:00.000Z',
  model: 'claude-sonnet-5-5',
  basedOn: basedOn.map((id) => ({ id, week: 0 })),
  sections: { diagnosis: 'd', strategies: ['s'], practice: ['p'], studyTopics: ['t'] },
  usage: { inputTokens: 1, outputTokens: 1, costUsd: 0.01 },
})

describe('newMissesSince (stale Focus notes)', () => {
  it('counts the Focus misses that are not in basedOn', () => {
    const s = st({ 'B3-03': miss(0, 'K'), 'B3-05': miss(0, 'K'), 'W1D1-B2': miss(0, 'K'), 'W2D1-B1': miss(0, 'K'), 'B4-03': miss(0, 'R') })
    expect(newMissesSince(s, 'focus:K', note(['B3-03', 'B3-05']))).toBe(2)
    expect(newMissesSince(s, 'focus:K', note(['B3-03', 'B3-05', 'W1D1-B2', 'W2D1-B1']))).toBe(0)
  })

  it('after a full sample (5), older misses left out on purpose are not new; newer ones are', () => {
    const s = st({
      'B3-03': miss(0, 'K'), 'B3-05': miss(0, 'K'), // older than the sample
      'W1D1-B2': miss(0, 'K'), 'W1D1-C2': miss(0, 'K'), 'W2D1-B1': miss(0, 'K'), 'W3D1-B1': miss(0, 'K'), 'W3D2-B1': miss(0, 'K'),
    })
    const n = note(['W3D2-B1', 'W3D1-B1', 'W2D1-B1', 'W1D1-C2', 'W1D1-B2'])
    expect(newMissesSince(s, 'focus:K', n)).toBe(0)
    expect(newMissesSince({ ...s, attempts: { ...s.attempts, 'W4D1-B1': miss(0, 'K') } }, 'focus:K', n)).toBe(1)
  })

  it('per-miss notes never go stale', () => {
    const s = st({ 'B3-03': miss(0, 'K'), 'B3-05': miss(0, 'K') })
    expect(newMissesSince(s, 'miss:B3-03', note(['B3-03']))).toBe(0)
  })
})

describe('adoptFix (Use as Fix)', () => {
  it("writes the strategy only to the selected misses' first-attempt Fix; nothing else changes", () => {
    const s = st({
      'B3-03': miss(0, 'K', { fix: 'old fix' }),
      'B3-05': miss(0, 'K'),
      'W1D1-B2': [
        { round: 1, answer: 'a', confidence: 3, score: 0, errorCode: 'K' },
        { round: 2, answer: 'b', confidence: 3, score: 0, fix: 'retry fix' },
      ],
    })
    const next = adoptFix(s, ['B3-03', 'W1D1-B2'], 'Write the definition first.')
    expect(next.attempts['B3-03'][0]).toEqual({ ...s.attempts['B3-03'][0], fix: 'Write the definition first.' })
    expect(next.attempts['W1D1-B2']).toEqual([
      { ...s.attempts['W1D1-B2'][0], fix: 'Write the definition first.' },
      s.attempts['W1D1-B2'][1],
    ])
    expect(next.attempts['B3-05']).toBe(s.attempts['B3-05'])
    expect({ ...next, attempts: null }).toEqual({ ...s, attempts: null })
  })
})
