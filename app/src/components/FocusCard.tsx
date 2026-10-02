import type { Focus } from '../lib/focus'

const weekLabel = (w: number) => (w === 0 ? 'Baseline' : w === 13 ? 'Final' : `W${w}`)

/** One Focus with its evidence. `max` is the top score, for the relative bar. */
export function FocusCard({ focus: f, max, onPick }: { focus: Focus; max: number; onPick?: () => void }) {
  const skills = Object.entries(f.skills)
    .sort((a, b) => b[1] - a[1])
    .map(([skill, n]) => `${skill} ${n}`)
    .join(', ')
  return (
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
}
