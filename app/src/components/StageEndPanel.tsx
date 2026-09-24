import { actions, type State } from '../lib/store'
import { STAGE_QUESTIONS, finalRecord, stageAnswers, stageBlocks, stageEnd, stageReflectionKey, type StageKind } from '../lib/stageend'

const min = (m: number | null) => (m == null ? '-' : `${m.toFixed(1)} min`)

/** Pill for Dashboard and Plan: a stage stays incomplete until error analysis and reflection are saved. */
export function StageEndStatus({ s, stage }: { s: State; stage: StageKind }) {
  const e = stageEnd(s, stage)
  const label = e.complete ? 'complete' : !e.errorsComplete ? 'error analysis first' : 'reflection needed'
  return <span className={`pill ${e.complete ? 'done' : 'todo'}`}>{label}</span>
}

/** Final record sheet: timed and untimed scores, the gap, section scores and time used. */
export function FinalRecordSheet({ s }: { s: State }) {
  const r = finalRecord(s)
  const t = r.totals
  return (
    <div className="card">
      <b>Exam record sheet</b>
      <div className="small">
        Timed score {t.timed} / {r.possible} · Untimed (U) score {t.untimed} / {r.possible} · Gap {t.gap > 0 ? '+' : ''}
        {t.gap}
        {!t.complete && <span className="muted"> (provisional until every Item is scored)</span>}
      </div>
      <div className="small">Time used: {min(r.timeUsedMin)}</div>
      <table>
        <thead>
          <tr>
            <th>Section</th>
            <th className="num">Score</th>
            <th className="num">Time used</th>
          </tr>
        </thead>
        <tbody>
          {r.sections.map((x) => (
            <tr key={x.section}>
              <td>{x.section}</td>
              <td className="num">
                {x.score}/{x.points}
              </td>
              <td className="num">{min(x.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Stage-end flow: error analysis, then all 4 reflection questions; the Final adds its record sheet. */
export function StageEndPanel({ s, stage }: { s: State; stage: StageKind }) {
  const e = stageEnd(s, stage)
  const open = stageBlocks(stage).find((d) => d.itemIds.some((id) => e.uncoded.includes(id) || e.unfixed.includes(id)))
  const answers = stageAnswers(s, stage)
  return (
    <div className="card">
      <b>{stage === 'baseline' ? 'Baseline' : 'Final Examination'} wrap-up</b>
      <p className="small">
        1. Error analysis{' '}
        <span className={`pill ${e.errorsComplete ? 'done' : 'todo'}`}>
          {!e.blocksDone ? 'waiting for all Blocks' : e.errorsComplete ? 'done' : 'open'}
        </span>
        {open && (
          <>
            {' '}
            <a href={`#/block/${open.key}`}>complete it</a>
          </>
        )}
      </p>
      {stage === 'final' && <FinalRecordSheet s={s} />}
      <div className="small">2. Reflection (all 4 answers required)</div>
      {!e.errorsComplete ? (
        <p className="muted small">Finish the error analysis first.</p>
      ) : (
        STAGE_QUESTIONS[stage].map((q, i) => (
          <label key={i} style={{ display: 'block', marginTop: 8 }}>
            <span>
              {i + 1}. {q}
            </span>
            <textarea
              value={answers[i]}
              onChange={(ev) => actions.setReflection(stageReflectionKey(stage, i), ev.target.value)}
              style={{ minHeight: 60 }}
            />
          </label>
        ))
      )}
    </div>
  )
}
