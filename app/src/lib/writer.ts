import { useSyncExternalStore } from 'react'
import { createWriterLock, type LocksLike, type Role } from './writerLock'
import { setReadOnly } from './store'
import { startRestore } from './startup'

/** Thin wiring: real navigator.locks. Logic lives in `writerLock.ts`. */
const TAKEOVER_FLAG = 'cognitive-gym:takeover'

const lock = createWriterLock({
  locks: typeof navigator !== 'undefined' ? (navigator as { locks?: LocksLike }).locks : undefined,
})

lock.subscribe(() => {
  if (lock.getRole() === 'readonly') setReadOnly(true) // e.g. another tab took over
})

/**
 * Decide the role before anything renders or writes. Only the writer runs startup restore (and so autosave);
 * a read-only tab never does. Take over = flag + reload: the fresh page steals the lock, then reads
 * localStorage and the file like any startup.
 */
export async function initWriter(): Promise<void> {
  let steal = false
  try {
    steal = sessionStorage.getItem(TAKEOVER_FLAG) === '1'
    sessionStorage.removeItem(TAKEOVER_FLAG)
  } catch {
    /* no sessionStorage: normal acquire */
  }
  await lock.start({ steal })
  if (lock.getRole() === 'readonly') setReadOnly(true)
  else void startRestore()
}

export function takeOver() {
  try {
    sessionStorage.setItem(TAKEOVER_FLAG, '1')
  } catch {
    /* falls back to a plain reload: still read-only if the lock is held */
  }
  location.reload()
}

export const useRole = (): Role => useSyncExternalStore(lock.subscribe, lock.getRole)
