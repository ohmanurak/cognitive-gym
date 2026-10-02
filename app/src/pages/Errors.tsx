import { useState } from 'react'
import { CoachPanel } from '../components/CoachPanel'
import { FocusCard } from '../components/FocusCard'
import { weakFixHint } from '../lib/erroranalysis'
import { rankFocus } from '../lib/focus'
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
      <WhatToWorkOn onPick={setFilter} />
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
            {a.fix ? (
              <div>
                Fix: {a.fix}
                {weakFixHint(a.fix) && <div className="muted small">{weakFixHint(a.fix)}</div>}
              </div>
            ) : <div className="muted small">No fix written yet.</div>}
          </div>
        )
      })}
    </div>
  )
}

function WhatToWorkOn({ onPick }: { onPick: (code: ErrorCode) => void }) {
  const s = useStore()
  const { focus, provisional, uncoded } = rankFocus(s)
  const top = focus.slice(0, 3)
  return (
    <section aria-labelledby="focus-heading">
      <h2 id="focus-heading">What to work on</h2>
      {top.length === 0 && provisional.length === 0 && (
        <p className="muted">No coded misses yet. Give each miss an Error code to see what to work on.</p>
      )}
      {top.length === 0 && provisional.length > 0 && (
        <p className="muted">Nothing ranks yet: each code needs 3+ misses to rank.</p>
      )}
      {top.map((f) => (
        <FocusCard key={f.code} focus={f} max={top[0].score} onPick={() => onPick(f.code)}>
          <CoachPanel focus={f} />
        </FocusCard>
      ))}
      {provisional.length > 0 && (
        <details className="small muted">
          <summary>Provisional: {provisional.map((f) => f.code).join(', ')} (needs 3+ misses to rank)</summary>
          {provisional.map((f) => (
            <div key={f.code}>
              {f.code} · {f.name}: {f.misses} {f.misses === 1 ? 'miss' : 'misses'}, {f.pointsLost} points lost
              <CoachPanel focus={f} />
            </div>
          ))}
        </details>
      )}
      {uncoded > 0 && <div className="small muted">{uncoded} {uncoded === 1 ? 'miss' : 'misses'} still uncoded</div>}
    </section>
  )
}
