import { Fragment, useId, useState } from 'react'
import { firstOpenMissBlock } from '../lib/erroranalysis'
import { ERROR_CODES, actions, type State } from '../lib/store'
import {
  daysTrained,
  insertStrategy,
  reflectionAnswers,
  reflectionQuestions,
  restDay,
  weekEnd,
  weekEndFocus,
  weekScorecard,
} from '../lib/weekend'
import { CoachPanel } from './CoachPanel'
import { FocusCard } from './FocusCard'

const pct = (n: number | null) => (n == null ? '-' : `${n.toFixed(0)}%`)

/** Status of a Week's week-end (Day 6 error analysis, then reflection), for Plan and Week pages. */
export function WeekEndStatus({ s, week }: { s: State; week: number }) {
  const we = weekEnd(s, week)
  const label = we.complete ? 'done' : !we.errors.complete ? 'error analysis first' : 'reflection needed'
  return (
    <span className="small">
      Week-end <span className={`pill ${we.complete ? 'done' : 'todo'}`}>{label}</span>
    </span>
  )
}

/** Read-only Scorecard: every figure comes from the Week's first attempts. */
export function WeekScorecardView({ s, week }: { s: State; week: number }) {
  const sc = weekScorecard(s, week)
  const dom = sc.stats.dominantError
  return (
    <div className="card">
      <b>Scorecard</b>
      <table>
        <thead>
          <tr>
            <th>Skill</th>
            <th className="num">Score</th>
            <th className="num">Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {sc.stats.skills
            .filter((r) => r.possible > 0)
            .map((r) => (
              <tr key={r.skill}>
                <td>{r.skill}</td>
                <td className="num">
                  {r.score}/{r.possible}
                </td>
                <td className="num">{pct(r.accuracy)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <div className="small">
        Dominant error: {dom ? `${dom} · ${ERROR_CODES.find((e) => e.code === dom)?.name}` : '-'}
      </div>
      <div className="small">
        Confidence {pct(sc.confidence)} vs accuracy {pct(sc.accuracy)}
        {sc.gap != null && ` (gap ${sc.gap > 0 ? '+' : ''}${sc.gap.toFixed(0)} points)`}
      </div>
      <div className="small">Efficiency (PE): {sc.stats.EI == null ? '-' : `${sc.stats.EI.toFixed(2)} correct/min`}</div>
    </div>
  )
}

/** Week-end flow: Day 6 error analysis, then one field per reflection question. */
export function WeekEndPanel({ s, week }: { s: State; week: number }) {
  const we = weekEnd(s, week)
  const open = firstOpenMissBlock(s, week, 6)
  const qs = reflectionQuestions(week)
  const answers = reflectionAnswers(s, week)
  const top = weekEndFocus(s, week)
  const promptId = useId()
  const strategy = qs.length - 1
  const note = top.focus ? s.coachingNotes?.[`focus:${top.focus.code}`] : undefined
  return (
    <div>
      <h2>Week-end</h2>
      <div className="small">
        Days trained this week: {daysTrained(s, week)}
        {restDay(s, week) && <span className="pill done"> Rest day: no training today</span>}
      </div>
      <p className="small">
        1. Day 6 error analysis{' '}
        <span className={`pill ${we.errors.complete ? 'done' : 'todo'}`}>
          {!we.errors.blocksDone ? 'waiting for the weekly challenge' : we.errors.complete ? 'done' : 'open'}
        </span>
        {open && (
          <>
            {' '}
            <a href={`#/block/${open.key}`}>complete it</a>
          </>
        )}
      </p>
      <WeekScorecardView s={s} week={week} />
      {top.callout && (
        <div className="notice" role="alert">
          {top.callout}
        </div>
      )}
      {top.focus && (
        <section aria-label="Top Focus">
          <h3>Top Focus</h3>
          <FocusCard focus={top.focus} max={top.focus.score}>
            <CoachPanel focus={top.focus} />
          </FocusCard>
          <a className="small" href="#/errors">
            see all on Error log
          </a>
        </section>
      )}
      <h3>2. Weekly reflection</h3>
      {!we.errors.complete ? (
        <p className="muted small">Finish the Day 6 error analysis first.</p>
      ) : (
        <>
          <div className="muted small">Only the last answer (strategy) is required.</div>
          {qs.map((q, i) => (
            <Fragment key={i}>
              <label style={{ display: 'block', marginTop: 8 }}>
                <span>
                  {i + 1}. {q}
                </span>
                <textarea
                  value={answers[i]}
                  onChange={(e) => actions.setWeekAnswer(week, i, e.target.value)}
                  aria-describedby={i === strategy ? promptId : undefined}
                  style={{ minHeight: 60 }}
                />
              </label>
              {i === strategy && (
                <div id={promptId} className="small muted">
                  {top.focus
                    ? `Your top Focus is ${top.focus.code} · ${top.focus.name}. What will you change?`
                    : 'What will you change next week?'}
                </div>
              )}
              {i === strategy && note && note.sections.strategies.length > 0 && (
                <InsertStrategy
                  strategies={note.sections.strategies}
                  onPick={(st) => actions.setWeekAnswer(week, i, insertStrategy(answers[i], st))}
                />
              )}
            </Fragment>
          ))}
          {!we.reflection && <p className="small">Week-end is complete once the last (strategy) answer is filled in.</p>}
        </>
      )}
    </div>
  )
}

/** "Insert strategy": the learner picks one strategy from the Coaching note; nothing is inserted until they do. */
function InsertStrategy({ strategies, onPick }: { strategies: string[]; onPick: (strategy: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <div className="row" style={{ marginTop: 4 }}>
        <button type="button" onClick={() => setOpen(true)}>
          Insert strategy
        </button>
      </div>
    )
  return (
    <div className="row" role="group" aria-label="Pick one strategy to insert" style={{ marginTop: 4 }}>
      {strategies.map((st, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            onPick(st)
            setOpen(false)
          }}
        >
          {st}
        </button>
      ))}
      <button type="button" className="muted" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  )
}
