import { useState } from 'react'
import { calibrationOf, scopeStats, type Scope, type ScopeStats } from '../lib/metrics'
import { useStore } from '../lib/store'

const scopes: { label: string; scope: Scope }[] = [
  { label: 'Base', scope: { kind: 'baseline' } },
  ...Array.from({ length: 12 }, (_, i) => ({ label: `W${i + 1}`, scope: { kind: 'week', week: i + 1 } as Scope })),
  { label: 'Final', scope: { kind: 'final' } },
]

const n1 = (v: number | null) => (v == null ? '·' : v.toFixed(1))

function Trend({ points, label }: { points: (number | null)[]; label: string }) {
  const W = 260
  const H = 60
  const known = points.map((v, i) => (v == null ? null : ([i, v] as const))).filter((x) => x !== null)
  if (known.length < 2) return <div className="small muted">{label}: needs two scored stages</div>
  const step = W / (points.length - 1)
  const path = known.map(([i, v], k) => `${k ? 'L' : 'M'}${(i * step).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`).join(' ')
  return (
    <div>
      <div className="small muted">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={label}>
        <line x1="0" y1={H} x2={W} y2={H} stroke="var(--line)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {known.map(([i, v]) => (
          <circle key={i} cx={i * step} cy={H - (v / 100) * H} r="2.5" fill="var(--accent)" />
        ))}
      </svg>
    </div>
  )
}

export function Stats() {
  const s = useStore()
  const [pick, setPick] = useState(0)
  const rows = scopes.map((x) => ({ ...x, st: scopeStats(s, x.scope) }))
  const sel: ScopeStats = rows[pick].st
  const cal = calibrationOf(s)

  return (
    <div>
      <h1>Progress</h1>
      <div className="notice">
        These are training-progress indicators, not IQ scores. They are not norm-referenced and not comparable across people. Only first attempts count; retries are practice.
      </div>

      <h2>Dashboard (Workbook §0.9)</h2>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th className="num">Pattern</th>
              <th className="num">Abstr.</th>
              <th className="num">WM</th>
              <th className="num">Hypoth.</th>
              <th className="num">Eff./min</th>
              <th className="num">Accuracy %</th>
              <th>Top error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} onClick={() => setPick(i)} style={{ cursor: 'pointer', fontWeight: i === pick ? 700 : 400 }}>
                <td>{r.label}</td>
                <td className="num">{n1(r.st.PI)}</td>
                <td className="num">{n1(r.st.AI)}</td>
                <td className="num">{n1(r.st.WMI)}</td>
                <td className="num">{n1(r.st.HI)}</td>
                <td className="num">{r.st.EI == null ? '·' : r.st.EI.toFixed(2)}</td>
                <td className="num">{n1(r.st.accuracy)}</td>
                <td>{r.st.dominantError ?? '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="small muted" style={{ marginTop: 8 }}>
          Pattern uses PD items and block times. Abstraction and Hypothesis use your rubric self-scores as a share of available points. WM needs a reliable backward digit span from the trainer. Efficiency = correct Processing items per minute. Blank = no data yet.
        </div>
      </div>

      <h2>Trend: overall accuracy</h2>
      <div className="card">
        <Trend points={rows.map((r) => r.st.accuracy)} label="Baseline → Week 1–12 → Final" />
        <div className="small muted">Order: {rows.map((r) => r.label).join(' · ')}</div>
      </div>

      <h2>Scorecard: {rows[pick].label}</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Skill</th>
              <th className="num">Score</th>
              <th className="num">Possible</th>
              <th className="num">Accuracy %</th>
            </tr>
          </thead>
          <tbody>
            {sel.skills.map((r) => (
              <tr key={r.skill}>
                <td>{r.skill}</td>
                <td className="num">{r.score}</td>
                <td className="num">{r.possible}</td>
                <td className="num">{n1(r.accuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Calibration (all stages)</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Confidence</th>
              <th className="num">Items</th>
              <th className="num">Correct %</th>
              <th>Expected</th>
            </tr>
          </thead>
          <tbody>
            {cal.map((c, i) => (
              <tr key={c.confidence}>
                <td>{c.confidence}</td>
                <td className="num">{c.n}</td>
                <td className="num">{c.accuracy == null ? '·' : (c.accuracy * 100).toFixed(0)}</td>
                <td className="muted">{['~20–30%', '~40–50%', '~60–70%', '~80–90%', '≥95%'][i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="small muted" style={{ marginTop: 8 }}>
          Correct = full points. Rating-5 items right well under 95% means overconfident; rating-2 items right far above 50% means underconfident.
        </div>
      </div>
    </div>
  )
}
