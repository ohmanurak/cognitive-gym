import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  abandonOpen,
  BASELINE_SEQUENCES,
  baselineSpanDone,
  buildLadder,
  expectedAnswer,
  LADDER_SIZE,
  recordTrial,
  reliableSpan,
  spanAsOf,
  startSpanTest,
  type SpanTest,
} from './spantest'

/** Run a whole ladder; wrongAt lists "direction:length:attempt" rungs to fail. */
function run(kind: 'baseline' | 'retest', id: string, start: number, wrong: string[] = [], rng?: () => number): SpanTest {
  let t = startSpanTest(id, kind, start)
  for (const s of buildLadder(kind, rng)) {
    const bad = wrong.includes(`${s.direction}:${s.length}:${s.attempt}`)
    t = recordTrial(t, s, bad ? 'x' : expectedAnswer(s), start + 1000)
  }
  return t
}

describe('ladder', () => {
  it('matches workbook tables 2A/2B', () => {
    const md = readFileSync(new URL('../../../workbook/Cognitive_Gym_Workbook.md', import.meta.url), 'utf8')
    const rows = [...md.matchAll(/^\| (\d) \| `([\d ]+)` \| `([\d ]+)` \|$/gm)].map((m) => [
      Number(m[1]),
      m[2].replace(/ /g, ''),
      m[3].replace(/ /g, ''),
    ])
    const flat = [...Object.entries(BASELINE_SEQUENCES.forward), ...Object.entries(BASELINE_SEQUENCES.backward)]
    for (const [len, [a, b]] of flat) {
      expect(rows.some((r) => r[0] === Number(len) && r[1] === a && r[2] === b)).toBe(true)
    }
    expect(LADDER_SIZE).toBe(22)
  })

  it('retest uses random sequences with the same shape', () => {
    let n = 0
    const rng = () => ((n++ * 7) % 10) / 10
    const r = buildLadder('retest', rng)
    const b = buildLadder('baseline')
    expect(r.map((s) => [s.direction, s.length, s.attempt])).toEqual(b.map((s) => [s.direction, s.length, s.attempt]))
    expect(r.every((s) => s.sequence.length === s.length)).toBe(true)
    expect(r.map((s) => s.sequence)).not.toEqual(b.map((s) => s.sequence))
  })
})

describe('scoring', () => {
  it('backward answers are reversed', () => {
    expect(expectedAnswer({ direction: 'backward', sequence: '308' })).toBe('803')
  })

  it('perfect ladder gives 9 forward and 7 backward, finishing on the last rung only', () => {
    const t = run('baseline', 'a', 0)
    expect(t.finishedAt).toBe(1000)
    expect(reliableSpan(t, 'forward')).toBe(9)
    expect(reliableSpan(t, 'backward')).toBe(7)
    const partial = { ...t, finishedAt: null, trials: t.trials.slice(0, 21) }
    expect(partial.finishedAt).toBeNull()
  })

  it('reliable span needs both attempts; no stop rule', () => {
    const t = run('baseline', 'a', 0, ['forward:7:2', 'forward:5:1', 'backward:3:1'])
    expect(t.trials.length).toBe(LADDER_SIZE)
    expect(reliableSpan(t, 'forward')).toBe(9)
    const t2 = run('baseline', 'b', 0, ['forward:9:1', 'forward:8:2', 'backward:7:2', 'backward:6:1'])
    expect(reliableSpan(t2, 'forward')).toBe(7)
    expect(reliableSpan(t2, 'backward')).toBe(5)
    const t3 = run('baseline', 'c', 0, ['backward:3:1', 'backward:3:2'])
    expect(reliableSpan(t3, 'backward')).toBe(7)
  })
})

describe('abandon and spanAsOf', () => {
  it('abandoned ladder is kept but never counts', () => {
    const t = recordTrial(startSpanTest('x', 'baseline', 0), buildLadder('baseline')[0], '5260', 10)
    const list = abandonOpen([t])
    expect(list[0].abandoned).toBe(true)
    expect(list[0].trials.length).toBe(1)
    expect(baselineSpanDone(list)).toBe(false)
    expect(spanAsOf(list, 1e9)).toBeNull()
    expect(recordTrial(list[0], buildLadder('baseline')[1], '1', 20)).toBe(list[0])
  })

  it('baseline done needs a complete baseline test; retests do not count', () => {
    expect(baselineSpanDone([run('retest', 'r', 0)])).toBe(false)
    expect(baselineSpanDone([run('baseline', 'b', 0)])).toBe(true)
  })

  it('uses the latest complete test on or before the time', () => {
    const a = run('baseline', 'a', 0)
    const b = run('retest', 'b', 10000, ['forward:9:1'])
    const c = { ...run('retest', 'c', 20000), finishedAt: null, abandoned: true }
    expect(spanAsOf([a, b, c], 500)).toBeNull()
    expect(spanAsOf([a, b, c], 1000)!.forward).toBe(9)
    expect(spanAsOf([a, b, c], 11000)!.forward).toBe(8)
    expect(spanAsOf([a, b, c], 99999)!.forward).toBe(8)
  })
})
