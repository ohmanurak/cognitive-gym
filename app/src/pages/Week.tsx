import { blockStatus, nextUp, progressOf } from '../lib/metrics'
import { DayErrorStep } from './DayErrorStep'
import { WeekEndPanel, WeekEndStatus } from '../components/WeekEndPanel'
import { useStore } from '../lib/store'
import { blocks, dayMeta, weekMeta } from '../lib/structure'

export function Plan() {
  const s = useStore()
  const groups = [
    { title: 'Baseline assessment', defs: blocks.filter((b) => b.stage === 'baseline') },
    ...Array.from({ length: 12 }, (_, i) => ({
      title: `Week ${i + 1} · ${weekMeta(i + 1)?.title}`,
      defs: blocks.filter((b) => b.week === i + 1),
    })),
    { title: 'Final Examination', defs: blocks.filter((b) => b.stage === 'final') },
  ]
  const next = nextUp(s)
  return (
    <div>
      <h1>Plan</h1>
      <div className="muted">Every block in workbook order. Free access; skipping ahead is your call.</div>
      {groups.map((g) => (
        <div key={g.title}>
          <h2>
            {g.title}
            {g.defs[0]?.week != null && (
              <span style={{ marginLeft: 12, fontWeight: 'normal' }}>
                <WeekEndStatus s={s} week={g.defs[0].week} />
              </span>
            )}
          </h2>
          <div className="card">
            <table>
              <tbody>
                {g.defs.map((d) => {
                  const st = blockStatus(s, d)
                  const dm = d.week && d.day ? dayMeta(d.week, d.day) : undefined
                  const lastOfDay = d.week != null && g.defs[g.defs.indexOf(d) + 1]?.day !== d.day
                  return (
                    <tr key={d.key}>
                      <td style={{ width: 130 }}>
                        <a href={`#/block/${d.key}`}>{d.label}</a>
                      </td>
                      <td>
                        {d.title}
                        {dm && <span className="muted small"> · {dm.title}</span>}
                        {next?.key === d.key && <span className="pill"> next up</span>}
                        {lastOfDay && d.week && d.day && (
                          <div>
                            <DayErrorStep s={s} week={d.week} day={d.day} />
                          </div>
                        )}
                      </td>
                      <td className="num small muted">{d.itemIds.length} items</td>
                      <td className="num">
                        <span className={`pill ${st}`}>{st}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

export function WeekPage({ week }: { week: number }) {
  const s = useStore()
  const meta = weekMeta(week)
  if (!meta) return <p>Unknown week.</p>
  const defs = blocks.filter((b) => b.week === week)
  const days = [...new Set(defs.map((d) => d.day!))]
  const p = progressOf(s, defs)
  return (
    <div>
      <h1>
        Week {week} · {meta.title}
      </h1>
      <div className="muted">
        {meta.phase} phase · {p.itemsDone}/{p.itemsTotal} items done
      </div>
      {days.map((d) => (
        <div className="card" key={d}>
          <b>
            Day {d} · {dayMeta(week, d)?.title}
          </b>
          <div style={{ float: 'right' }}>
            <DayErrorStep s={s} week={week} day={d} />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            {defs
              .filter((x) => x.day === d)
              .map((x) => (
                <a key={x.key} className="btn" href={`#/block/${x.key}`}>
                  {x.label.split('·')[1]?.trim()} <span className={`pill ${blockStatus(s, x)}`}>{blockStatus(s, x)}</span>
                </a>
              ))}
          </div>
        </div>
      ))}
      <WeekEndPanel s={s} week={week} />
      <p>
        <a href="#/stats">See scorecard and indices</a>
      </p>
    </div>
  )
}
