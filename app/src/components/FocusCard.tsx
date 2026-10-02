import type { ReactNode } from 'react'
import type { Focus } from '../lib/focus'

const weekLabel = (w: number) => (w === 0 ? 'Baseline' : w === 13 ? 'Final' : `W${w}`)

/**
 * One Focus with its evidence. `max` is the top score, for the relative bar.
 * `children` (e.g. a CoachPanel) render under the card, outside its button.
 */
export function FocusCard({
  focus: f,
  max,
  onPick,
  children,
}: {
  focus: Focus
  max: number
  onPick?: () => void
  children?: ReactNode
}) {
  const skills = Object.entries(f.skills)
    .sort((a, b) => b[1] - a[1])
    .map(([skill, n]) => `${skill} ${n}`)
    .join(', ')
  const card = (
    <button type="button" className="card focus-card" aria-label={`${f.code} · ${f.name}`} onClick={onPick}>
      <div className="row">
        <b>
          {f.code} · {f.name}
        </b>
        {f.fixNotWorking && <span className="pill warn">Fix not working</span>}
      </div>
      <div className="small muted">
        {f.misses} misses · {f.pointsLost} points lost · {skills} · {f.weeks.map(weekLabel).join(', ')}
      </div>
      <div className="bar">
        <span style={{ width: `${max > 0 ? (f.score / max) * 100 : 0}%` }} />
      </div>
    </button>
  )
  if (children == null) return card
  return (
    <div className="focus-card-wrap">
      {card}
      {children}
    </div>
  )
}
