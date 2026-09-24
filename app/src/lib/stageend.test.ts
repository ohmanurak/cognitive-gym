import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { progressOf } from './metrics'
import { emptyState, setReflection, type Attempt, type State } from './state'
import { blocks } from './structure'
import { STAGE_QUESTIONS, finalRecord, stageBlocks, stageEnd, stageReflectionKey, type StageKind } from './stageend'

const md = readFileSync(resolve(__dirname, '../../../workbook/Cognitive_Gym_Workbook.md'), 'utf8')

/** Every Block of the stage committed and scored full (99), except the first Item when `miss`. */
function finished(stage: StageKind, miss = false): State {
  const s = emptyState()
  for (const d of stageBlocks(stage)) {
    if (d.spanTest) {
      s.spanTests = [{ id: 't', kind: 'baseline', startedAt: 0, finishedAt: 1, trials: [] }]
      continue
    }
    s.blocks[d.key] = { round: 1, committed: true, startedAt: null, elapsedMs: 0, snapshot: null, roundElapsed: [600_000], committedAt: [1000] } as never
    for (const id of d.itemIds) s.attempts[id] = [{ round: 1, answer: 'x', confidence: 3, score: 99 } as Attempt]
  }
  if (miss) {
    const id = stageBlocks(stage).find((d) => d.itemIds.length)!.itemIds[0]
    s.attempts[id][0].score = 0
  }
  return s
}

function answerAll(s: State, stage: StageKind, upTo = 4): State {
  for (let i = 0; i < upTo; i++) s = setReflection(s, stageReflectionKey(stage, i), `answer ${i}`)
  return s
}

describe.each(['baseline', 'final'] as const)('%s completion', (stage) => {
  it('has 4 reflection questions matching the workbook', () => {
    expect(STAGE_QUESTIONS[stage]).toHaveLength(4)
    for (const q of STAGE_QUESTIONS[stage]) {
      expect(md.replace(/\*/g, '')).toContain(q.replace(/ — /g, ' — '))
    }
  })

  it('incomplete until error analysis and reflection are both done', () => {
    let s = finished(stage, true)
    const miss = stageEnd(s, stage).misses[0]
    expect(stageEnd(s, stage).complete).toBe(false)
    s = answerAll(s, stage)
    expect(stageEnd(s, stage).complete).toBe(false) // reflection saved, error analysis open
    s.attempts[miss][0].errorCode = 'P'
    expect(stageEnd(s, stage).complete).toBe(false) // still no Fix
    s.attempts[miss][0].fix = 'Write the rule down first'
    expect(stageEnd(s, stage).complete).toBe(true)
  })

  it('needs all 4 reflection answers (blank does not count)', () => {
    let s = answerAll(finished(stage), stage, 3)
    expect(stageEnd(s, stage).errorsComplete).toBe(true) // no misses
    expect(stageEnd(s, stage).complete).toBe(false)
    s = setReflection(s, stageReflectionKey(stage, 3), '   ')
    expect(stageEnd(s, stage).complete).toBe(false)
    s = setReflection(s, stageReflectionKey(stage, 3), 'P')
    expect(stageEnd(s, stage).complete).toBe(true)
  })

  it('is not complete while Blocks are unfinished', () => {
    expect(stageEnd(answerAll(emptyState(), stage), stage).complete).toBe(false)
  })

  it('progress counts the stage as incomplete until then', () => {
    const defs = blocks.filter((b) => b.stage === stage)
    const before = progressOf(finished(stage), defs)
    expect(before.blocksDone).toBe(before.blocksTotal - 1)
    const after = progressOf(answerAll(finished(stage), stage), defs)
    expect(after.blocksDone).toBe(after.blocksTotal)
  })
})

describe('Final record sheet', () => {
  it('shows timed, untimed, gap, sections and time used', () => {
    const s = finished('final')
    const def = stageBlocks('final')[0]
    const [a, b] = def.itemIds
    s.attempts[a][0] = { ...s.attempts[a][0], answer: 'y', atTimeout: 'x', score: 0, untimedScore: 1 }
    s.attempts[b][0] = { ...s.attempts[b][0], score: 0 }
    const r = finalRecord(s)
    expect(r.totals.gap).toBe(r.totals.untimed - r.totals.timed)
    expect(r.totals.gap).toBe(1)
    expect(r.sections.map((x) => x.section[0])).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(r.sections.reduce((n, x) => n + x.points, 0)).toBe(r.possible)
    expect(r.timeUsedMin).toBe(10)
  })
})
