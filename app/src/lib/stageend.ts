/**
 * Baseline and Final Examination completion (pure). A stage is complete when
 * all its Blocks are done, every first-attempt miss has an Error code and a Fix,
 * and all 4 reflection questions are answered. The Final also gets a record sheet.
 */
import { blockStatus, firstAttempt } from './metrics'
import { blockState } from './state'
import type { State } from './state'
import { blockTotals, type BlockTotals } from './timed'
import { blocks, itemById, type BlockDef } from './structure'

export type StageKind = 'baseline' | 'final'

/** Workbook wording ("Baseline reflection", "Final reflection"); a test checks these against the workbook text. */
export const STAGE_QUESTIONS: Record<StageKind, string[]> = {
  baseline: [
    'Which section felt hardest relative to my expectations?',
    'Which items did I answer instantly with confidence 5 — and were any wrong?',
    'In how many Section 1 items did I notice a second plausible rule?',
    'Which error code dominates?',
  ],
  final: [
    'Which section improved most versus my baseline?',
    'Which error code is still my leader?',
    'Did I follow the skip-and-return protocol?',
    'What will I keep practising?',
  ],
}

export const stageBlocks = (stage: StageKind): BlockDef[] => blocks.filter((b) => b.stage === stage)

/** Storage key of a stage reflection answer in `State.reflections`. */
export const stageReflectionKey = (stage: StageKind, i: number) => `${stage}:${i + 1}`

export function stageAnswers(s: State, stage: StageKind): string[] {
  return STAGE_QUESTIONS[stage].map((_, i) => s.reflections?.[stageReflectionKey(stage, i)] ?? '')
}

export interface StageEnd {
  stage: StageKind
  /** Item ids of first-attempt misses, and those still lacking an Error code / a Fix. */
  misses: string[]
  uncoded: string[]
  unfixed: string[]
  blocksDone: boolean
  errorsComplete: boolean
  /** All 4 answers non-empty. */
  reflection: boolean
  complete: boolean
}

export function stageEnd(s: State, stage: StageKind): StageEnd {
  const defs = stageBlocks(stage)
  const misses: string[] = []
  const uncoded: string[] = []
  const unfixed: string[] = []
  for (const d of defs) {
    for (const id of d.itemIds) {
      const a = firstAttempt(s, id)
      if (!a || a.score == null || a.score >= itemById.get(id)!.points) continue
      misses.push(id)
      if (!a.errorCode) uncoded.push(id)
      if (!a.fix?.trim()) unfixed.push(id)
    }
  }
  const blocksDone = defs.length > 0 && defs.every((d) => blockStatus(s, d) === 'done')
  const errorsComplete = blocksDone && uncoded.length === 0 && unfixed.length === 0
  const reflection = stageAnswers(s, stage).every((a) => a.trim() !== '')
  return { stage, misses, uncoded, unfixed, blocksDone, errorsComplete, reflection, complete: errorsComplete && reflection }
}

export interface RecordRow {
  section: string
  points: number
  score: number
  /** Minutes of focused time on the section's Items in round 1; null when not tracked. */
  minutes: number | null
}

export interface FinalRecord {
  totals: BlockTotals
  possible: number
  sections: RecordRow[]
  /** Time used on the exam in minutes (first round), or null before it is committed. */
  timeUsedMin: number | null
}

const SECTION_NAME: Record<string, string> = {
  A: 'A Pattern',
  B: 'B Abstraction',
  C: 'C Working memory',
  D: 'D Probability / hypothesis',
  E: 'E Integrated',
}

/** Final record sheet: timed / untimed / gap, section scores (latest scores) and time used. */
export function finalRecord(s: State): FinalRecord {
  const def = stageBlocks('final')[0]
  const totals = blockTotals(s, def.itemIds)
  const b = blockState(s, def.key)
  const bySection = new Map<string, RecordRow>()
  for (const id of def.itemIds) {
    const letter = /^F-([A-Z])/.exec(id)?.[1] ?? '?'
    const row = bySection.get(letter) ?? { section: SECTION_NAME[letter] ?? letter, points: 0, score: 0, minutes: null }
    const list = s.attempts[id]
    const a = list?.[list.length - 1]
    row.points += itemById.get(id)!.points
    row.score += a?.score ?? 0
    const ms = b.roundItemMs[0]?.[id]
    if (ms != null) row.minutes = (row.minutes ?? 0) + ms / 60000
    bySection.set(letter, row)
  }
  const ms = b.roundElapsed[0]
  return {
    totals,
    possible: def.itemIds.reduce((a, id) => a + itemById.get(id)!.points, 0),
    sections: [...bySection.entries()].sort().map(([, r]) => r),
    timeUsedMin: ms == null ? null : ms / 60000,
  }
}
