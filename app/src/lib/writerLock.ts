/**
 * Single-writer tab lock (pure logic; navigator.locks is injected).
 * The first tab holds a Web Lock and is the writer; later tabs are read-only. The browser frees the lock
 * when the tab closes or crashes. There is no automatic takeover: `start({ steal: true })` is the explicit one.
 * Without Web Locks every tab is a writer (last write wins).
 */
export const LOCK_NAME = 'cognitive-gym:writer'

export type Role = 'pending' | 'writer' | 'readonly'

export interface LocksLike {
  request(name: string, options: { ifAvailable?: boolean; steal?: boolean }, cb: (lock: unknown) => unknown): Promise<unknown>
}

export interface WriterLock {
  /** Resolves once the role is decided. */
  start(opts?: { steal?: boolean }): Promise<void>
  getRole(): Role
  subscribe(l: () => void): () => void
}

export function createWriterLock(deps: { locks: LocksLike | undefined }): WriterLock {
  let role: Role = 'pending'
  const listeners = new Set<() => void>()
  const setRole = (next: Role) => {
    if (next === role) return
    role = next
    listeners.forEach((l) => l())
  }
  return {
    getRole: () => role,
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    start(opts = {}) {
      const { locks } = deps
      if (!locks) {
        setRole('writer')
        return Promise.resolve()
      }
      return new Promise<void>((done) => {
        try {
          locks
            .request(LOCK_NAME, opts.steal ? { steal: true } : { ifAvailable: true }, (lock) => {
              if (!lock) {
                setRole('readonly')
                done()
                return undefined
              }
              setRole('writer')
              done()
              return new Promise<void>(() => {}) // hold until the tab closes or the lock is stolen
            })
            .catch(() => {
              // Stolen by another tab's takeover (AbortError) -> read-only. Any failure before we
              // were granted the lock -> fall back to last-write-wins.
              setRole(role === 'writer' ? 'readonly' : 'writer')
              done()
            })
        } catch {
          setRole('writer')
          done()
        }
      })
    },
  }
}
