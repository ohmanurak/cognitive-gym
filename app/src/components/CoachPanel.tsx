import { useState } from 'react'
import { buildCoachPayload } from '../lib/coach'
import { requestDiagnosis, useCoach } from '../lib/coachClient'
import type { Focus } from '../lib/focus'
import type { CoachingNote } from '../lib/state'
import { actions, getState, useStore } from '../lib/store'

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * Coach me for one Focus: the button (shown only when the dev server's health check is ok)
 * and the saved `focus:<code>` Coaching note inline. Pass as FocusCard's children.
 */
export function CoachPanel({ focus }: { focus: Focus }) {
  const key = `focus:${focus.code}`
  const note = useStore().coachingNotes?.[key]
  const { health, running } = useCoach()
  const [error, setError] = useState<string | null>(null)
  const busy = running.has(key)
  const overCap = !!health && health.remainingUsd <= 0

  async function coach() {
    setError(null)
    const r = await requestDiagnosis(key, buildCoachPayload(getState(), focus))
    if (!r) return
    if ('note' in r) actions.setCoachingNote(key, r.note)
    else setError(r.error)
  }

  return (
    <div className="coach">
      {health && !note && (
        <div className="row">
          <button type="button" disabled={busy || overCap} onClick={coach}>
            Coach me · ~$0.01
          </button>
          {busy && (
            <span className="small muted" role="status">
              <span className="spinner" aria-hidden="true" /> Diagnosing… ~15 s
            </span>
          )}
          {overCap && <span className="small muted">Monthly coaching budget (${health.capUsd}) used</span>}
        </div>
      )}
      {error && (
        <div className="small warn" role="alert">
          {error}
        </div>
      )}
      {note && <CoachingNoteView note={note} />}
    </div>
  )
}

function CoachingNoteView({ note }: { note: CoachingNote }) {
  const { diagnosis, strategies, practice } = note.sections
  const [first] = diagnosis.split('\n')
  return (
    <details className="coach-note">
      <summary>
        Coaching note · {shortDate(note.createdAt)} · {first}
      </summary>
      <h4>Diagnosis</h4>
      <p className="pre">{diagnosis}</p>
      <h4>Strategy</h4>
      <ul>
        {strategies.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h4>Practice</h4>
      <ul>
        {practice.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <div className="small muted">Cost ${note.usage.costUsd.toFixed(3)}</div>
    </details>
  )
}
