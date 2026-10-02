import { describe, expect, it } from 'vitest'
import { buildCoachPayload } from './coach'
import { rankFocus } from './focus'
import { emptyState, type Attempt, type ErrorCode, type State } from './state'
import { itemById } from './structure'

const miss = (score: number | null, errorCode?: ErrorCode, extra: Partial<Attempt> = {}): Attempt[] => [
  { round: 1, answer: 'my answer', confidence: 3, score, errorCode, ...extra },
]
const st = (attempts: State['attempts']): State => ({ ...emptyState(), attempts })
const focusOf = (s: State, code: ErrorCode) => {
  const r = rankFocus(s)
  return [...r.focus, ...r.provisional].find((f) => f.code === code)!
}

describe('buildCoachPayload', () => {
  it('sends the latest 5 coded first-attempt misses of the Focus code, newest first', () => {
    const s = st({
      'B3-03': miss(0, 'K'),
      'B3-05': miss(0, 'K'),
      'W1D1-B2': miss(0, 'K'),
      'W1D1-C2': miss(0, 'K'),
      'W2D1-B1': miss(0, 'K'),
      'W3D1-B1': miss(0, 'K'),
      'B4-03': miss(0, 'R'),
    })
    const p = buildCoachPayload(s, focusOf(s, 'K'))
    // Newest week first; within a week, later workbook Items first.
    expect(p.misses.map((m) => m.id)).toEqual(['W3D1-B1', 'W2D1-B1', 'W1D1-C2', 'W1D1-B2', 'B3-05'])
    expect(p.basedOn).toEqual([
      { id: 'W3D1-B1', week: 3 },
      { id: 'W2D1-B1', week: 2 },
      { id: 'W1D1-C2', week: 1 },
      { id: 'W1D1-B2', week: 1 },
      { id: 'B3-05', week: 0 },
    ])
  })

  it('sends only scored first-attempt misses (Discipline Rule: Key already seen)', () => {
    const s = st({
      'B3-03': miss(0, 'K'),
      'B3-05': miss(null, 'K'), // not scored yet: Key not seen
      'W1D1-B2': [
        { round: 1, answer: 'right', confidence: 3, score: 2 },
        { round: 2, answer: 'retry', confidence: 3, score: 0, errorCode: 'K' },
      ],
      'W1D1-C2': miss(2, 'K'), // full marks
      'W2D1-B1': miss(0, 'K'),
    })
    expect(buildCoachPayload(s, focusOf(s, 'K')).misses.map((m) => m.id)).toEqual(['W2D1-B1', 'B3-03'])
  })

  it('each miss carries Item text, Answer, Key, Skill, Con/Car, assumption and Fix; plus code definition and Focus evidence', () => {
    const s = st({
      'W1D1-B2': miss(0, 'K', { nature: 'Con', assumption: 'thought X meant Y', fix: 'Write the definition first.' }),
      'B3-03': miss(0, 'K'),
      'B3-05': miss(1, 'K'),
    })
    const f = focusOf(s, 'K')
    const item = itemById.get('W1D1-B2')!
    const p = buildCoachPayload(s, f)
    expect(p.misses[0]).toEqual({
      id: 'W1D1-B2',
      week: 1,
      skill: item.skill,
      points: item.points,
      score: 0,
      item: item.body,
      answer: 'my answer',
      key: { answer: item.key!.answer, derivation: item.key!.derivation, trap: item.key!.trap },
      conCar: 'Con',
      failedAssumption: 'thought X meant Y',
      fix: 'Write the definition first.',
    })
    expect(p.misses[1]).toMatchObject({ id: 'B3-05', conCar: null, failedAssumption: null, fix: null })
    expect(p.focus).toEqual({
      code: 'K',
      name: 'Knowledge gap',
      definition: 'Missing definition or fact (e.g. what a "confounder" is).',
      misses: 3,
      pointsLost: f.pointsLost,
      weeks: [0, 1],
      fixNotWorking: f.fixNotWorking,
    })
  })
})
