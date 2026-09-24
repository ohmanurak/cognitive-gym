import type { State } from '../lib/state'
import { blockTotals } from '../lib/timed'

/** Timed and untimed totals with the gap, shown once every Item is scored. */
export function TimedSummary({ s, itemIds }: { s: State; itemIds: string[] }) {
  const t = blockTotals(s, itemIds)
  if (!t.complete) return null
  return (
    <div className="notice" style={{ marginTop: 12 }}>
      Timed (T) {t.timed} · Untimed (U) {t.untimed} · Gap {t.gap >= 0 ? '+' : ''}
      {t.gap}
    </div>
  )
}
