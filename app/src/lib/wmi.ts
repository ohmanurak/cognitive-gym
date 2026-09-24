// WMI per stage from the Span tests (as-of the stage's last Block commit) plus WM Item accuracy.
import { blockState, type Attempt, type State } from './state'
import { itemById } from './structure'
import { isComplete, reliableSpan, spanAsOf } from './spantest'
import { firstAttempt, scopeBlocks, type Scope } from './metrics'

export interface WmiResult {
  WMI: number
  /** A class (manipulation or multi-step) had no Items; weights renormalised. */
  provisional: boolean
}

/** Effective multi-step: learner toggle when set, else the workbook tag. */
export function isMultiStep(attempt: Attempt | undefined, tag: boolean): boolean {
  return attempt?.multiStep ?? tag
}

/** Backward Reliable span the stage counts, or null when no complete Span test applies. */
function stageSpan(s: State, scope: Scope): number | null {
  if (scope.kind === 'final') return spanAsOf(s.spanTests, Infinity)?.backward ?? null
  if (scope.kind === 'baseline') {
    const base = s.spanTests.filter((t) => t.kind === 'baseline' && isComplete(t))
    const t = base.sort((a, b) => b.finishedAt! - a.finishedAt!)[0]
    return t ? reliableSpan(t, 'backward') : null
  }
  let last = -Infinity
  for (const def of scopeBlocks(scope)) {
    for (const at of blockState(s, def.key).committedAt) last = Math.max(last, at)
  }
  if (last === -Infinity) return null
  return spanAsOf(s.spanTests, last)?.backward ?? null
}

export function wmiFor(s: State, scope: Scope): WmiResult | null {
  const span = stageSpan(s, scope)
  if (span === null) return null
  const manip: number[] = []
  const multi: number[] = []
  for (const def of scopeBlocks(scope)) {
    for (const id of def.itemIds) {
      const item = itemById.get(id)!
      const a = firstAttempt(s, id)
      if (item.skill !== 'WM' || !a || a.score == null) continue
      ;(isMultiStep(a, item.multiStepTag) ? multi : manip).push(a.score / item.points)
    }
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const spanTerm = Math.min(1, span / 8)
  if (!manip.length && !multi.length) return null
  let v: number
  if (manip.length && multi.length) v = 0.2 * spanTerm + 0.4 * mean(manip) + 0.4 * mean(multi)
  else if (manip.length) v = 0.2 * spanTerm + 0.8 * mean(manip)
  else v = 0.2 * spanTerm + 0.8 * mean(multi)
  return { WMI: 100 * v, provisional: !(manip.length && multi.length) }
}
