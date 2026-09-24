/**
 * Startup decision: what to do with the save file when the page loads (pure).
 * Runs once per page load. No I/O, no clock: the caller reads storage and the file.
 *
 * Cases (see ticket #39 / #35):
 * - local empty + file        -> restore (with notice)
 * - local present + file      -> silent planMerge; preview only if it adds or replaces a Block
 * - corrupt file              -> warn; saves stay on (writer moves the bad file to backups/ on the next save)
 * - newer schema / unreadable -> warn and suppress saves for this page load, so autosave cannot clobber it
 * - local present + no file   -> write now
 */
import { fingerprintMatches, SCHEMA_VERSION } from './integrity'
import { planMerge, type MergePlan } from './merge'
import { emptyState, type State } from './state'

export type FileResult =
  | { status: 'ok'; data: Record<string, unknown> }
  | { status: 'not-found' }
  | { status: 'corrupt' }
  | { status: 'error' }
  /** No writer answered (static host, network failure): silent. */
  | { status: 'unavailable' }

export type StartupAction =
  | { type: 'none' }
  | { type: 'write' }
  | { type: 'restore'; incoming: State; notice: string; fingerprintChanged: boolean }
  | { type: 'preview'; incoming: State; plan: MergePlan; fingerprintChanged: boolean }
  | { type: 'warn'; kind: 'corrupt' | 'newer' | 'unreadable'; suppressSaves: boolean }

export interface StartupInput {
  local: State
  /** Nothing was ever stored: storage key absent (or blank). Also re-checked against `local` itself. */
  localEmpty: boolean
  file: FileResult
  currentFingerprint: string
  itemsByBlock: Record<string, string[]>
}

export function isEmptyState(s: State): boolean {
  return (
    Object.values(s.attempts ?? {}).every((l) => !l?.length) &&
    Object.keys(s.drafts ?? {}).length === 0 &&
    Object.keys(s.blocks ?? {}).length === 0 &&
    (s.spans ?? []).length === 0 &&
    (s.spanTests ?? []).length === 0 &&
    Object.keys(s.reflections ?? {}).length === 0 &&
    Object.keys(s.weekReflections ?? {}).length === 0
  )
}

export const restoreNotice = (savedAt: unknown): string =>
  'Restored from ~/CognitiveGym/progress.json' +
  (typeof savedAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(savedAt) ? `, saved ${savedAt.slice(0, 10)}` : '')

export function decideStartup(i: StartupInput): StartupAction {
  const { file } = i
  if (file.status === 'unavailable') return { type: 'none' }
  if (file.status === 'not-found') return isEmptyState(i.local) ? { type: 'none' } : { type: 'write' }
  if (file.status === 'corrupt') return { type: 'warn', kind: 'corrupt', suppressSaves: false }
  if (file.status === 'error') return { type: 'warn', kind: 'unreadable', suppressSaves: true }

  const d = file.data
  if (typeof d.schemaVersion === 'number' && d.schemaVersion > SCHEMA_VERSION)
    return { type: 'warn', kind: 'newer', suppressSaves: true }
  if (d.app !== 'cognitive-gym' || !d.state || typeof d.state !== 'object' || Array.isArray(d.state))
    return { type: 'warn', kind: 'corrupt', suppressSaves: false }

  const incoming: State = { ...emptyState(), ...(d.state as Partial<State>) }
  const fingerprintChanged = fingerprintMatches(d.workbookFingerprint, i.currentFingerprint) === false

  if (i.localEmpty && isEmptyState(i.local)) {
    if (isEmptyState(incoming)) return { type: 'none' }
    return { type: 'restore', incoming, notice: restoreNotice(d.savedAt), fingerprintChanged }
  }
  const plan = planMerge(i.local, incoming, i.itemsByBlock)
  if (plan.added + plan.replaced === 0) return { type: 'none' }
  return { type: 'preview', incoming, plan, fingerprintChanged }
}
