import { useState } from 'react'
import { linksKey, requestLinks, useCoach } from '../lib/coachClient'
import type { CoachingNote } from '../lib/state'
import { actions } from '../lib/store'

/**
 * Find study links (#55) inside a saved Coaching note: the button (until links exist), the
 * running spinner, an inline error, and the links with a YouTube/Blog marker and their reason.
 * A failure never touches the saved note.
 */
export function StudyLinks({ noteKey, note }: { noteKey: string; note: CoachingNote }) {
  const { health, running } = useCoach()
  const [error, setError] = useState<string | null>(null)
  const busy = running.has(linksKey(noteKey))
  const overCap = !!health && health.remainingUsd <= 0

  async function find() {
    setError(null)
    const r = await requestLinks(noteKey, note.sections.searchTopic)
    if (!r) return
    if ('links' in r) actions.addCoachingLinks(noteKey, r.links, r.usage)
    else setError(r.error)
  }

  if (!health && note.links.length === 0) return null
  return (
    <>
      <h4>Study links</h4>
      {note.links.length > 0 && (
        <ul>
          {note.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                {l.title}
              </a>{' '}
              <span className="pill">{l.source === 'youtube' ? 'YouTube' : 'Blog'}</span>{' '}
              <span className="small muted">— {l.verified ? l.reason : 'search, not verified'}</span>
            </li>
          ))}
        </ul>
      )}
      {health && note.links.length === 0 && (
        <div className="row">
          <button type="button" disabled={busy || overCap} onClick={find}>
            Find study links · ~$0.16
          </button>
          {busy && (
            <span className="small muted" role="status">
              <span className="spinner" aria-hidden="true" /> Searching YouTube and blogs… ~15 s
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
    </>
  )
}
