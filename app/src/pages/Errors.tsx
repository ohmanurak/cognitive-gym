import { useState } from 'react'
import { ERROR_CODES, useStore, type ErrorCode } from '../lib/store'
import { blockOfItem, itemById } from '../lib/structure'

export function Errors() {
  const s = useStore()
  const [filter, setFilter] = useState<ErrorCode | ''>('')
  const rows = Object.entries(s.attempts)
    .flatMap(([id, list]) =>
      list
        .filter((a) => a.score != null && a.score < (itemById.get(id)?.points ?? 0))
        .map((a) => ({ id, a })),
    )
    .filter((r) => !filter || r.a.errorCode === filter)

  const counts = ERROR_CODES.map((c) => ({
    ...c,
    n: Object.values(s.attempts).flat().filter((a) => a.errorCode === c.code).length,
  }))

  return (
    <div>
      <h1>Error log</h1>
      <div className="muted">Every wrong answer gets one code and a strategy fix, not "be careful".</div>
      <div className="card row">
        {counts.map((c) => (
          <button
            key={c.code}
            className={filter === c.code ? 'on' : ''}
            onClick={() => setFilter(filter === c.code ? '' : c.code)}
            title={c.name}
          >
            {c.code} · {c.n}
          </button>
        ))}
      </div>
      {rows.length === 0 && <p className="muted">No errors logged.</p>}
      {rows.map(({ id, a }, i) => {
        const def = blockOfItem(id)
        return (
          <div className="card" key={`${id}-${i}`}>
            <div className="row">
              <a href={def ? `#/block/${def.key}` : '#/'} className="item-id">
                {id}
              </a>
              <span className="pill">{a.errorCode ?? 'uncoded'}</span>
              {a.nature && <span className="pill">{a.nature === 'Con' ? 'conceptual' : 'careless'}</span>}
              <span className="pill">round {a.round}</span>
            </div>
            {a.assumption && <div className="small">Failed assumption: {a.assumption}</div>}
            {a.fix ? <div>Fix: {a.fix}</div> : <div className="muted small">No fix written yet.</div>}
          </div>
        )
      })}
    </div>
  )
}
