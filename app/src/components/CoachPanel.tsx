import { useState } from 'react'
import { buildCoachPayload, buildMissPayload, newMissesSince } from '../lib/coach'
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
  const state = useStore()
  const fresh = note ? newMissesSince(state, key, note) : 0

  /** Replace the note only after the learner confirms; nothing regenerates automatically. */
  function regenerate() {
    if (note && window.confirm(`Replace note from ${shortDate(note.createdAt)}? ~$0.01`)) void coach()
  }

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
      {note && fresh > 0 && (
        <div className="row small">
          <span>
            {fresh} new {fresh === 1 ? 'miss' : 'misses'} since this note
          </span>
          {health && (
            <button type="button" disabled={busy || overCap} onClick={regenerate}>
              Regenerate
            </button>
          )}
          {busy && (
            <span className="muted" role="status">
              <span className="spinner" aria-hidden="true" /> Diagnosing… ~15 s
            </span>
          )}
        </div>
      )}
      {note && <CoachingNoteView note={note} fixTargets={focus.itemIds} />}
    </div>
  )
}

/**
 * "Coach this miss" for one Error log row: the small link (health ok, no note yet) and the
 * saved `miss:<itemId>` note inline. Per-miss notes never go stale.
 */
export function MissCoachPanel({ itemId }: { itemId: string }) {
  const key = `miss:${itemId}`
  const note = useStore().coachingNotes?.[key]
  const { health, running } = useCoach()
  const [error, setError] = useState<string | null>(null)
  const busy = running.has(key)
  const overCap = !!health && health.remainingUsd <= 0

  async function coach() {
    setError(null)
    const payload = buildMissPayload(getState(), itemId)
    if (!payload) return
    const r = await requestDiagnosis(key, payload)
    if (!r) return
    if ('note' in r) actions.setCoachingNote(key, r.note)
    else setError(r.error)
  }

  if (!note && !health && !error) return null
  return (
    <div className="coach">
      {health && !note && (
        <div className="row small">
          <button type="button" className="link" disabled={busy || overCap} onClick={coach}>
            Coach this miss · ~$0.01
          </button>
          {busy && (
            <span className="muted" role="status">
              <span className="spinner" aria-hidden="true" /> Diagnosing… ~15 s
            </span>
          )}
          {overCap && <span className="muted">Monthly coaching budget (${health.capUsd}) used</span>}
        </div>
      )}
      {error && (
        <div className="small warn" role="alert">
          {error}
        </div>
      )}
      {note && <CoachingNoteView note={note} fixTargets={[itemId]} />}
    </div>
  )
}

/**
 * Use as Fix: a checklist of the note's misses. Copies the (editable) strategy into the
 * first-attempt Fix of the checked ones only. A miss that already has a Fix starts unchecked
 * and shows the Fix it would replace, so nothing is overwritten silently.
 */
function UseAsFix({ strategy, itemIds, onDone }: { strategy: string; itemIds: string[]; onDone: () => void }) {
  const s = useStore()
  const current = (id: string) => s.attempts[id]?.find((a) => a.round === 1)?.fix?.trim() ?? ''
  const [text, setText] = useState(strategy)
  const [picked, setPicked] = useState(() => new Set(itemIds.filter((id) => !current(id))))
  const toggle = (id: string) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }
  const chosen = itemIds.filter((id) => picked.has(id))
  return (
    <fieldset className="use-as-fix" aria-label="Use as Fix">
      <textarea aria-label="Fix text" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      {itemIds.map((id) => (
        <label key={id} className="small" style={{ display: 'block' }}>
          <input type="checkbox" checked={picked.has(id)} onChange={() => toggle(id)} /> {id}
          {current(id) && <span className="muted"> · replaces: {current(id)}</span>}
        </label>
      ))}
      <div className="row">
        <button
          type="button"
          disabled={chosen.length === 0 || !text.trim()}
          onClick={() => {
            actions.adoptFix(chosen, text.trim())
            onDone()
          }}
        >
          Copy to {chosen.length} {chosen.length === 1 ? 'miss' : 'misses'}
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </fieldset>
  )
}

function CoachingNoteView({ note, fixTargets }: { note: CoachingNote; fixTargets?: string[] }) {
  const { diagnosis, strategies, practice } = note.sections
  const [adopting, setAdopting] = useState<number | null>(null)
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
          <li key={i}>
            {s}
            {fixTargets && fixTargets.length > 0 && adopting !== i && (
              <>
                {' '}
                <button type="button" className="link small" onClick={() => setAdopting(i)}>
                  Use as Fix
                </button>
              </>
            )}
            {fixTargets && adopting === i && <UseAsFix strategy={s} itemIds={fixTargets} onDone={() => setAdopting(null)} />}
          </li>
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
