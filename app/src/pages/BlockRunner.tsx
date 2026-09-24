import { weakFixHint } from '../lib/erroranalysis'
import { useEffect, useState } from 'react'
import { Md } from '../components/Md'
import { RubricDims } from '../components/RubricDims'
import { hasRubric } from '../lib/rubric'
import { hintText, storedSuggestion, suggestionFor } from '../lib/grade'
import { itemMsNow, overTarget, shouldNudge } from '../lib/itemtime'
import { blockStatus, latestAttempt } from '../lib/metrics'
import { actions, blockState, elapsedNow, ERROR_CODES, useStore, type State } from '../lib/store'
import { itemReady } from '../lib/state'
import { blockByKey, blocks, itemById, type BlockDef } from '../lib/structure'
import { effectiveFreezeMin, effectiveLimit } from '../lib/gate'
import { TimedSummary } from '../components/TimedSummary'
import { needsUntimedScore } from '../lib/timed'
import type { Item } from '../parser/parseWorkbook'


function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Timer({ def, s }: { def: BlockDef; s: State }) {
  const b = blockState(s, def.key)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!b.startedAt) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [b.startedAt])

  const elapsed = elapsedNow(b, now)
  const eff = effectiveLimit(s, def)
  const limitMin = eff.limitMin
  const limitMs = (limitMin ?? 0) * 60000
  const over = limitMs > 0 && elapsed > limitMs
  const freezeAt = effectiveFreezeMin(s, def)
  const frozen = freezeAt !== null && elapsed > freezeAt * 60000
  const hardDiffers = def.hardLimitMin !== null && def.hardLimitMin !== limitMin
  const nextMarker = def.paceMarkers.find((m) => m.atMin * 60000 > elapsed)

  useEffect(() => {
    if (frozen && !b.snapshot && !b.committed) actions.snapshotOvertime(def.key, def.itemIds)
  }, [frozen, def, b.snapshot, b.committed])

  return (
    <div className="card">
      <div className="row">
        <span className={`timer${over ? ' over' : ''}`}>{fmt(elapsed)}</span>
        <span className="muted">
          {limitMin === null
            ? 'no stated limit'
            : `/ ${limitMin} min ${def.strict ? (hardDiffers ? `(target; hard limit ${def.hardLimitMin})` : '(strict)') : '(soft)'}`}
        </span>
        <span className="grow" />
        {!b.committed &&
          (b.startedAt ? (
            <button onClick={() => actions.pauseClock(def.key)}>Pause</button>
          ) : (
            <button className="primary" onClick={() => actions.startClock(def.key)}>
              {elapsed > 0 ? 'Resume' : 'Start clock'}
            </button>
          ))}
      </div>
      {eff.note && (
        <div className="small muted" style={{ marginTop: 6 }}>
          {eff.note}
        </div>
      )}
      {def.paceMarkers.length > 0 && !b.committed && nextMarker && (
        <div className="small muted" style={{ marginTop: 6 }}>
          Pace (not binding): {nextMarker.label} at {nextMarker.atMin}:00
        </div>
      )}
      {over && hardDiffers && !frozen && !b.committed && (
        <div className="notice">
          Target of {limitMin} min reached. The hard limit is {def.hardLimitMin} min; answers freeze then.
        </div>
      )}
      {frozen && !b.committed && (
        <div className="notice">
          Time is up. Answers as they stand are frozen as <b>T</b>. Keep working without the clock; both versions are recorded.
        </div>
      )}
    </div>
  )
}

function CoverReveal({ children }: { children: React.ReactNode }) {
  const [left, setLeft] = useState(0)
  const [peeks, setPeeks] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  if (left > 0) {
    return (
      <div>
        <div className="small muted">Visible for {left}s. Cover it and work from memory.</div>
        {children}
      </div>
    )
  }
  return (
    <div className="covered">
      <div>Cover-and-reveal item{peeks ? ` (looked ${peeks}×)` : ''}</div>
      <button
        className="primary"
        onClick={() => {
          setPeeks(peeks + 1)
          setLeft(20)
        }}
      >
        {peeks ? 'Look again' : 'Reveal for 20 s'}
      </button>
    </div>
  )
}

function ItemCard({ item, def, s }: { item: Item; def: BlockDef; s: State }) {
  const b = blockState(s, def.key)
  const draft = s.drafts[item.id] ?? { answer: '', confidence: 0 }
  const attempt = b.committed ? latestAttempt(s, item.id) : undefined
  const isCover = /cover-and-reveal/i.test(item.body) && !b.committed

  // Re-render while this Item is being timed so the nudge and S mark appear live.
  const [now, setNow] = useState(Date.now())
  const timing = !b.committed && b.startedAt !== null && b.focus?.itemId === item.id
  useEffect(() => {
    if (!timing) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [timing])
  const ms = itemMsNow(b, item.id, now)
  const overS = item.week !== null && item.week >= 5 && item.week <= 6 && item.timing?.kind === 'target' && overTarget(ms, item.timing.minutes)
  const nudge = !b.committed && shouldNudge(item.week, ms, draft.answer.trim() !== '')

  const body = <Md>{item.body}</Md>
  return (
    <div
      className="card"
      id={item.id}
      onFocus={() => !b.committed && actions.focusItem(def.key, item.id)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) actions.focusItem(def.key, null)
      }}
    >
      <div className="item-head">
        <span className="item-id">{item.id}</span>
        <span className="pill">{item.skill}</span>
        <span className="pill">
          {item.points} pt{item.points > 1 ? 's' : ''}
          {item.star ? ' ★' : ''}
        </span>
        {item.trapItem && <span className="pill">🪤 trap</span>}
        {item.timing && (
          <span className="pill">
            ⏱ {item.timing.kind === 'target' ? 'target' : item.timing.strict ? 'strict drill' : 'limit'} {item.timing.minutes} min
          </span>
        )}
        {overS && <span className="pill">S · over target by more than 50%</span>}
      </div>
      {nudge && <div className="notice">Over 75 s on this item. Consider the Skip flag and move on.</div>}
      <div style={{ marginTop: 8 }}>{isCover ? <CoverReveal>{body}</CoverReveal> : body}</div>

      {!b.committed ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            placeholder="Your answer"
            value={draft.answer}
            onChange={(e) => actions.setDraft(item.id, { answer: e.target.value })}
          />
          <div className="row" style={{ marginTop: 6 }}>
            <span className="conf">
              <span className="small muted">Confidence</span>
              {[1, 2, 3, 4, 5].map((c) => (
                <button
                  key={c}
                  className={draft.confidence === c ? 'on' : ''}
                  onClick={() => actions.setDraft(item.id, { confidence: c })}
                >
                  {c}
                </button>
              ))}
            </span>
            <span className="grow" />
            <button className={draft.skipped ? 'small on' : 'small'} onClick={() => actions.toggleSkip(item.id)}>
              {draft.skipped ? 'Skipped (undo)' : 'Skip'}
            </button>
          </div>
        </div>
      ) : (
        attempt && <Review item={item} attempt={attempt} />
      )}
    </div>
  )
}

function Review({ item, attempt }: { item: Item; attempt: NonNullable<ReturnType<typeof latestAttempt>> }) {
  const key = item.key!
  const hint = suggestionFor(item, attempt.answer)
  const options = Array.from({ length: item.points + 1 }, (_, i) => i)
  const second = needsUntimedScore(attempt)
  const wrong = attempt.score != null && attempt.score < item.points

  return (
    <div>
      <div className="small muted" style={{ marginTop: 8 }}>
        {attempt.skipped ? '↷ Skipped' : `Your answer (confidence ${attempt.confidence}):`}
      </div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{attempt.answer}</div>
      {attempt.atTimeout !== undefined && attempt.atTimeout !== attempt.answer && (
        <div className="small muted">Timed answer (T, frozen at the limit): {attempt.atTimeout || '(blank)'}</div>
      )}

      <div className="key">
        {key.answer && <Md>{`**Key:** ${key.answer}`}</Md>}
        {key.derivation && <Md>{key.derivation}</Md>}
        {key.trap && key.trap !== '—' && <Md>{`*Trap:* ${key.trap}`}</Md>}
        {key.model && <Md>{key.model}</Md>}
      </div>

      {hasRubric(item) && <RubricDims item={item} attempt={attempt} />}

      <div className="row" style={{ marginTop: 10 }}>
        <span className="small muted">
          {second ? 'Timed score (T)' : 'Score'}
          {hintText(hint, key.open)}
        </span>
        {options.map((n) => (
          <button
            key={n}
            className={attempt.score === n ? 'on' : ''}
            onClick={() => actions.mark(item.id, { score: n })}
          >
            {n}
          </button>
        ))}
      </div>

      {second && (
        <div className="row" style={{ marginTop: 6 }}>
          <span className="small muted">Untimed score (U): {attempt.answer || '(blank)'}</span>
          {options.map((n) => (
            <button
              key={n}
              className={attempt.untimedScore === n ? 'on' : ''}
              onClick={() => actions.mark(item.id, { untimedScore: n })}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {wrong && (
        <div style={{ marginTop: 10 }}>
          <div className="row">
            <select
              value={attempt.errorCode ?? ''}
              onChange={(e) => actions.mark(item.id, { errorCode: (e.target.value || undefined) as never })}
              style={{ flex: 2, minWidth: 180 }}
            >
              <option value="">Error code…</option>
              {ERROR_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
            <select
              value={attempt.nature ?? ''}
              onChange={(e) => actions.mark(item.id, { nature: (e.target.value || undefined) as never })}
              style={{ flex: 1, minWidth: 130 }}
            >
              <option value="">Conceptual / careless…</option>
              <option value="Con">Conceptual</option>
              <option value="Car">Careless</option>
            </select>
          </div>
          <input
            type="text"
            style={{ marginTop: 6 }}
            placeholder="The assumption that failed"
            value={attempt.assumption ?? ''}
            onChange={(e) => actions.mark(item.id, { assumption: e.target.value })}
          />
          <input
            type="text"
            style={{ marginTop: 6 }}
            placeholder="Fix: a strategy, not 'be careful'"
            value={attempt.fix ?? ''}
            onChange={(e) => actions.mark(item.id, { fix: e.target.value })}
          />
          {weakFixHint(attempt.fix) && <div className="muted small">{weakFixHint(attempt.fix)}</div>}
        </div>
      )}
    </div>
  )
}

export function BlockRunner({ blockKey }: { blockKey: string }) {
  const s = useStore()
  const def = blockByKey.get(blockKey)
  if (!def) return <p>Unknown block.</p>
  const b = blockState(s, def.key)
  const items = def.itemIds.map((id) => itemById.get(id)!)
  const ready = items.every((it) => {
    return itemReady(s.drafts[it.id])
  })
  const status = blockStatus(s, def)
  const idx = blocks.findIndex((x) => x.key === def.key)
  const next = blocks[idx + 1]
  const spanBlock = def.key === 'base:2'

  return (
    <div>
      <h1>{def.label}</h1>
      <div className="muted">
        {def.title}
        {b.round > 1 && ` · retry round ${b.round} (practice only, not counted in Indices)`}
      </div>

      <Timer def={def} s={s} />

      {spanBlock && (
        <div className="notice">
          Digit-span tasks (Baseline 2A/2B) are in the <a href="#/block/base:2span">Span test</a> (practice in <a href="#/span">Span practice</a>). The items below are 2C.
        </div>
      )}

      {!b.committed && (
        <div className="notice">
          Discipline rule: the Key stays hidden until every item has an answer and a confidence rating and you commit the block.
        </div>
      )}

      {items.map((it) => (
        <ItemCard key={it.id} item={it} def={def} s={s} />
      ))}

      {b.committed && <TimedSummary s={s} itemIds={def.itemIds} />}

      <div className="row" style={{ marginTop: 16 }}>
        {!b.committed ? (
          <button className="primary" disabled={!ready} onClick={() => actions.commitBlock(def.key, def.itemIds, (id, a) => storedSuggestion(itemById.get(id)!, a))}>
            Commit block and reveal Key
          </button>
        ) : (
          <>
            {status === 'done' ? (
              <span className="pill done">Block complete</span>
            ) : (
              <span className="pill committed">Score every item to complete</span>
            )}
            {status === 'done' && (
              <button onClick={() => actions.retryBlock(def.key)}>Retry (practice only)</button>
            )}
            <span className="grow" />
            <a className="btn" href="#/errors">
              Error log
            </a>
            {next && (
              <a className="btn primary" href={`#/block/${next.key}`}>
                Next: {next.label}
              </a>
            )}
          </>
        )}
        {!b.committed && !ready && <span className="small muted">Answer and rate every item to commit.</span>}
      </div>
    </div>
  )
}
