/**
 * Coach me, browser side: the health check and which notes are running, shared by every
 * Coach panel on the page. Thin wrapper over fetch; the payload is built in `coach.ts`.
 */
import { useSyncExternalStore } from 'react'
import type { CoachPayload, MissPayload } from './coach'
import type { CoachingNote } from './state'

export interface CoachHealth {
  ok: boolean
  remainingUsd: number
  capUsd: number
}

interface Snapshot {
  /** null until the health check answers; stays null (hidden) when it fails. */
  health: CoachHealth | null
  /** Note keys with a diagnosis in flight. */
  running: ReadonlySet<string>
}

const EMPTY: Snapshot = { health: null, running: new Set() }
let snap: Snapshot = EMPTY
let checked = false
const listeners = new Set<() => void>()

function set(patch: Partial<Snapshot>) {
  snap = { ...snap, ...patch }
  listeners.forEach((l) => l())
}

async function checkHealth() {
  try {
    const r = await fetch('/api/coach/health')
    const h = r.ok ? ((await r.json()) as CoachHealth) : null
    set({ health: h && h.ok === true ? h : null })
  } catch {
    // Static build or dev server down: no Coach UI.
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  if (!checked) {
    checked = true
    void checkHealth()
  }
  return () => listeners.delete(l)
}

export function useCoach(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap)
}

/** Tests only: forget the health answer and running notes. */
export function resetCoachClient() {
  snap = EMPTY
  checked = false
}

export type DiagnoseResult = { note: CoachingNote } | { error: string }

/**
 * POST /api/coach/diagnose (or /diagnose-miss for a `miss:` key). Refuses (null) when the
 * same note is already running.
 */
export async function requestDiagnosis(key: string, payload: CoachPayload | MissPayload): Promise<DiagnoseResult | null> {
  if (snap.running.has(key)) return null
  set({ running: new Set([...snap.running, key]) })
  const { basedOn, ...forClaude } = payload
  try {
    const r = await fetch(key.startsWith('miss:') ? '/api/coach/diagnose-miss' : '/api/coach/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, payload: forClaude, basedOn }),
    })
    const body = (await r.json().catch(() => ({}))) as { note?: CoachingNote; error?: string; remainingUsd?: number }
    if (snap.health && typeof body.remainingUsd === 'number') set({ health: { ...snap.health, remainingUsd: body.remainingUsd } })
    if (r.ok && body.note) return { note: body.note }
    return { error: body.error ?? `Coach failed (${r.status})` }
  } catch {
    return { error: "Couldn't reach Claude" }
  } finally {
    const running = new Set(snap.running)
    running.delete(key)
    set({ running })
  }
}

/** Running-set key for a note's link search (kept apart from its diagnosis). */
export const linksKey = (key: string) => `links:${key}`

export type LinksResult = { links: CoachingNote['links']; usage: CoachingNote['usage'] } | { error: string }

/** POST /api/coach/links. Refuses (null) when this note's search is already running. */
export async function requestLinks(key: string, searchTopic: string): Promise<LinksResult | null> {
  const run = linksKey(key)
  if (snap.running.has(run)) return null
  set({ running: new Set([...snap.running, run]) })
  try {
    const r = await fetch('/api/coach/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, searchTopic }),
    })
    const body = (await r.json().catch(() => ({}))) as Partial<{ links: CoachingNote['links']; usage: CoachingNote['usage'] }> & {
      error?: string
      remainingUsd?: number
    }
    if (snap.health && typeof body.remainingUsd === 'number') set({ health: { ...snap.health, remainingUsd: body.remainingUsd } })
    if (r.ok && Array.isArray(body.links) && body.usage) return { links: body.links, usage: body.usage }
    return { error: body.error ?? `Link search failed (${r.status})` }
  } catch {
    return { error: "Couldn't reach Claude" }
  } finally {
    const running = new Set(snap.running)
    running.delete(run)
    set({ running })
  }
}
