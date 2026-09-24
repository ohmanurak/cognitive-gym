import { useSyncExternalStore } from 'react'
import { emptyMeta, SCHEMA_VERSION, workbookFingerprint, type BackupMeta } from './integrity'
import { workbook } from './structure'

// Lives beside the practice state so old saved data keeps loading unchanged.
const META_KEY = 'cognitive-gym:meta'

function load(): BackupMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) return { ...emptyMeta(), ...JSON.parse(raw) }
  } catch {
    /* unavailable or corrupt: start empty */
  }
  return emptyMeta()
}

let meta = load()
const listeners = new Set<() => void>()

function set(next: BackupMeta) {
  meta = next
  try {
    const stamp = { schemaVersion: SCHEMA_VERSION, workbookFingerprint: workbookFingerprint(workbook.items) }
    localStorage.setItem(META_KEY, JSON.stringify({ ...meta, ...stamp }))
  } catch {
    /* keep in memory only */
  }
  listeners.forEach((l) => l())
}

export function useBackupMeta(): BackupMeta {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => meta,
  )
}

/** Call on every state change. */
export function markChanged(now = Date.now()) {
  set({ ...meta, lastChangedAt: now, firstUnsavedAt: meta.firstUnsavedAt ?? now })
}

export function markExported(weeksDone: number, now = Date.now()) {
  set({ ...meta, lastExportedAt: now, firstUnsavedAt: null, weeksAtExport: weeksDone })
}
