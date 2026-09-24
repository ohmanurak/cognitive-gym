/**
 * Autosave to the dev-server save file (pure logic; clock, timers and fetch are injected).
 * A save is triggered only when a new completion milestone appears (see saveTriggers.ts),
 * debounced; a hidden tab flushes only if milestones changed since the last good save.
 * No timers for retry: a failed save is retried only by the next trigger.
 */
export const ENDPOINT = '/api/progress'
export const DEBOUNCE_MS = 2000
export const BACKUP_EVERY_MS = 10 * 60 * 1000

/** pending = nothing attempted yet; off = no writer; failed = writer refused or errored. */
export type AutosaveStatus = 'pending' | 'on' | 'off' | 'failed'

export interface AutosaveResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export interface AutosaveDeps {
  fetch(url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }): Promise<AutosaveResponse>
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  /** Current completion milestones of the state. */
  milestones(): ReadonlySet<string>
  /** Export JSON to write. */
  body(): string
}

export interface Autosaver {
  /** Call on every state change; schedules a save only if a new milestone appeared. */
  notify(): void
  /** Tab hidden or closing: save now if milestones changed since the last good save. */
  flush(): void
  /** Save now regardless of milestones (startup write, after applying a file merge). */
  saveNow(): void
  /** While true nothing is written (notify, flush, saveNow are no-ops). Used when the file must not be overwritten. */
  suppress(on: boolean): void
  getStatus(): AutosaveStatus
  subscribe(l: () => void): () => void
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x))

export function createAutosaver(deps: AutosaveDeps): Autosaver {
  let handled = new Set(deps.milestones())
  let saved = new Set(handled)
  let lastBackupAt: number | null = null
  let status: AutosaveStatus = 'pending'
  let timer: unknown = null
  let suppressed = false
  let chain: Promise<void> = Promise.resolve()
  const listeners = new Set<() => void>()

  function setStatus(next: AutosaveStatus) {
    if (next === status) return
    status = next
    listeners.forEach((l) => l())
  }

  async function attempt() {
    const cur = new Set(deps.milestones())
    handled = cur
    const at = deps.now()
    const backup = lastBackupAt === null || at - lastBackupAt >= BACKUP_EVERY_MS
    try {
      const res = await deps.fetch(backup ? `${ENDPOINT}?backup=1` : ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: deps.body(),
      })
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        /* not JSON: a static host answering, not our writer */
      }
      const isWriter = typeof body === 'object' && body !== null && !Array.isArray(body)
      if (res.ok && isWriter && (body as { ok?: unknown }).ok === true) {
        saved = cur
        if (backup) lastBackupAt = at
        setStatus('on')
      } else if (isWriter && res.status >= 400 && res.status !== 404 && res.status !== 405 && 'error' in (body as object)) {
        setStatus('failed')
      } else {
        setStatus('off')
      }
    } catch {
      setStatus('off')
    }
  }

  const run = () => {
    timer = null
    chain = chain.then(attempt, attempt)
  }

  return {
    notify() {
      if (suppressed) return
      const cur = deps.milestones()
      if (![...cur].some((m) => !handled.has(m))) return
      if (timer !== null) deps.clearTimer(timer)
      timer = deps.setTimer(run, DEBOUNCE_MS)
    },
    flush() {
      if (suppressed) return
      if (sameSet(deps.milestones(), saved)) return
      if (timer !== null) deps.clearTimer(timer)
      run()
    },
    saveNow() {
      if (suppressed) return
      if (timer !== null) deps.clearTimer(timer)
      run()
    },
    suppress(on) {
      suppressed = on
      if (on && timer !== null) {
        deps.clearTimer(timer)
        timer = null
      }
    },
    getStatus: () => status,
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}
