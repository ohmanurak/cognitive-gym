// Pure data-integrity helpers: versioning, orphans, backup reminder rule.
import type { State } from './state'

export const SCHEMA_VERSION = 1
export const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000

interface FingerprintItem {
  id: string
  skill: string
  points: number
}

/** Stable hash (FNV-1a 32-bit) of the Item list: ids, skills and points, order-independent. */
export function workbookFingerprint(items: FingerprintItem[]): string {
  const lines = items.map((i) => `${i.id}|${i.skill}|${i.points}`).sort()
  let h = 0x811c9dc5
  for (const ch of lines.join('\n')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** null = unknown (old data without a fingerprint), else whether it matches the workbook. */
export function fingerprintMatches(saved: unknown, current: string): boolean | null {
  return typeof saved === 'string' ? saved === current : null
}

export interface Orphans {
  attempts: { itemId: string; round: number; answer: string }[]
  drafts: { itemId: string; answer: string }[]
  blocks: string[]
  count: number
}

/** Data whose Item id or Block key is no longer in the workbook. Never deletes anything. */
export function findOrphans(
  state: State,
  knownItemIds: Iterable<string>,
  knownBlockKeys?: Iterable<string>,
): Orphans {
  const items = new Set(knownItemIds)
  const keys = knownBlockKeys ? new Set(knownBlockKeys) : null
  const attempts: Orphans['attempts'] = []
  for (const [itemId, list] of Object.entries(state.attempts ?? {})) {
    if (items.has(itemId)) continue
    for (const a of list) attempts.push({ itemId, round: a.round, answer: a.answer })
  }
  const drafts = Object.entries(state.drafts ?? {})
    .filter(([id]) => !items.has(id))
    .map(([itemId, d]) => ({ itemId, answer: d.answer }))
  const blocks = keys ? Object.keys(state.blocks ?? {}).filter((k) => !keys.has(k)) : []
  return { attempts, drafts, blocks, count: attempts.length + drafts.length + blocks.length }
}

/** Number of Weeks whose every Block is complete. */
export function weeksCompleted(weekBlocks: { week: number; complete: boolean }[]): number {
  const byWeek = new Map<number, boolean>()
  for (const b of weekBlocks) byWeek.set(b.week, (byWeek.get(b.week) ?? true) && b.complete)
  let n = 0
  for (const done of byWeek.values()) if (done) n++
  return n
}

export interface BackupMeta {
  /** First change since the last export; null when nothing is unsaved. */
  firstUnsavedAt: number | null
  lastChangedAt: number | null
  lastExportedAt: number | null
  /** Weeks completed at the time of the last export. */
  weeksAtExport: number
}

export const emptyMeta = (): BackupMeta => ({
  firstUnsavedAt: null,
  lastChangedAt: null,
  lastExportedAt: null,
  weeksAtExport: 0,
})

/** Show the banner: unsaved changes older than 7 days, or a Week completed since the last export. */
export function shouldRemind(meta: BackupMeta, now: number, weeksDone: number): boolean {
  if (meta.firstUnsavedAt !== null && now - meta.firstUnsavedAt > REMIND_AFTER_MS) return true
  return weeksDone > meta.weeksAtExport
}
