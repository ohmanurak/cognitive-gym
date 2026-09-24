/**
 * Which state changes count as a save trigger (pure). A milestone is a completion
 * fact; a save is due when a new one appears. Drafts, timers, focus and skips
 * never create one, so they never trigger a write.
 */
import { errorAnalysis } from './erroranalysis'
import { isComplete } from './spantest'
import { stageEnd } from './stageend'
import type { State } from './state'
import { blocks } from './structure'
import { reflectionQuestions, reflectionSaved } from './weekend'

export function saveMilestones(s: State): Set<string> {
  const m = new Set<string>()
  // Block Commit (each round).
  for (const [key, b] of Object.entries(s.blocks)) {
    b.committedAt.forEach((at, i) => {
      if (at != null) m.add(`commit:${key}:${i + 1}`)
    })
  }
  // Block error analysis finished, per Day (Day 6 included).
  const days = new Set(blocks.filter((b) => b.week != null && b.day != null).map((b) => `${b.week}:${b.day}`))
  for (const wd of days) {
    const [w, d] = wd.split(':').map(Number)
    if (errorAnalysis(s, w, d).complete) m.add(`errors:${wd}`)
  }
  // Weekly reflection saved.
  for (const w of new Set(blocks.map((b) => b.week).filter((w): w is number => w != null))) {
    if (reflectionQuestions(w).length > 0 && reflectionSaved(s, w)) m.add(`reflection:week${w}`)
  }
  // Baseline / Final: error analysis finished, reflection saved.
  for (const stage of ['baseline', 'final'] as const) {
    const e = stageEnd(s, stage)
    if (e.errorsComplete) m.add(`errors:${stage}`)
    if (e.reflection) m.add(`reflection:${stage}`)
  }
  // Span test completion.
  for (const t of s.spanTests) if (isComplete(t)) m.add(`span:${t.id}`)
  return m
}
