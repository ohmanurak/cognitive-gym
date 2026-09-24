import { StageEndStatus } from '../components/StageEndPanel'
import { blockStatus, nextUp, progressOf } from '../lib/metrics'
import { useStore } from '../lib/store'
import { blocks, totalPoints, weekMeta, workbook } from '../lib/structure'

export function Bar({ value, total }: { value: number; total: number }) {
  return (
    <div className="bar" aria-label={`${value} of ${total}`}>
      <span style={{ width: `${total ? (value / total) * 100 : 0}%` }} />
    </div>
  )
}

export function Dashboard() {
  const s = useStore()
  const all = progressOf(s, blocks)
  const next = nextUp(s)
  const phases = ['Accuracy', 'Automaticity', 'Speed', 'Integration']

  return (
    <div>
      <h1>Cognitive Gym</h1>
      <div className="muted">
        12-week reasoning workbook. Progress indicators only; nothing here is an IQ estimate.
      </div>

      <div className="card">
        <div className="row">
          <b>Overall</b>
          <span className="grow" />
          <span className="muted">
            {all.itemsDone} / {all.itemsTotal} items · {all.blocksDone} / {all.blocksTotal} blocks · {totalPoints} pts total
          </span>
        </div>
        <Bar value={all.itemsDone} total={all.itemsTotal} />
        {next ? (
          <div className="row" style={{ marginTop: 12 }}>
            <span>
              Next up: <b>{next.label}</b> <span className="muted">· {next.title}</span>
            </span>
            <span className="grow" />
            <a className="btn primary" href={`#/block/${next.key}`}>
              {blockStatus(s, next) === 'todo' ? 'Start' : 'Continue'}
            </a>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>Everything is complete.</div>
        )}
      </div>

      <h2>Stages</h2>
      {[
        { name: 'Baseline', stage: 'baseline' as const, defs: blocks.filter((b) => b.stage === 'baseline') },
        ...phases.map((p) => ({
          name: `${p} phase`,
          defs: blocks.filter((b) => b.week !== null && weekMeta(b.week)?.phase === p),
        })),
        { name: 'Final Examination', stage: 'final' as const, defs: blocks.filter((b) => b.stage === 'final') },
      ].map(({ name, defs, ...rest }) => {
        const stage = 'stage' in rest ? rest.stage : undefined
        const p = progressOf(s, defs)
        return (
          <div className="card" key={name}>
            <div className="row">
              <b>{name}</b> {stage && <StageEndStatus s={s} stage={stage} />}
              <span className="grow" />
              <span className="muted small">
                {p.itemsDone} / {p.itemsTotal} items
              </span>
            </div>
            <Bar value={p.itemsDone} total={p.itemsTotal} />
          </div>
        )
      })}

      <h2>Weeks</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Theme</th>
              <th className="num">Items</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {workbook.weeks.map((w) => {
              const p = progressOf(s, blocks.filter((b) => b.week === w.week))
              return (
                <tr key={w.week}>
                  <td>
                    <a href={`#/week/${w.week}`}>W{w.week}</a>
                  </td>
                  <td>
                    {w.title} <span className="pill">{w.phase}</span>
                  </td>
                  <td className="num">
                    {p.itemsDone}/{p.itemsTotal}
                  </td>
                  <td style={{ width: 140 }}>
                    <Bar value={p.itemsDone} total={p.itemsTotal} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
