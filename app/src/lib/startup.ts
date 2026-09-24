import { useSyncExternalStore } from 'react'
import { ENDPOINT } from './autosave'
import { currentFingerprint } from './backup'
import { decideStartup, type FileResult } from './startupRestore'
import type { MergePlan } from './merge'
import type { State } from './state'
import { actions, autosaver, getState, storageWasBlank } from './store'
import { blocks } from './structure'

/** Thin startup wiring: reads the save file once per page load and applies the pure decision (startupRestore.ts). */
export interface StartupView {
  notice: string | null
  warning: string | null
  preview: { incoming: State; plan: MergePlan; warn: string } | null
}

const FP_WARN = ' The workbook has changed since this file was saved: unmatched attempts are listed under Data.'
const WARN_TEXT = {
  corrupt:
    'The progress file (~/CognitiveGym/progress.json) is unreadable. Keeping your browser progress. The next save moves the bad file into backups/ and writes a fresh one.',
  newer:
    'The progress file was written by a newer version of this app. It was not read and will not be overwritten: file saving is off until you update the app and reload.',
  unreadable: 'The progress file could not be read. It will not be overwritten: file saving is off until you reload.',
}

let view: StartupView = { notice: null, warning: null, preview: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<StartupView>) => {
  view = { ...view, ...patch }
  listeners.forEach((l) => l())
}
export const useStartupView = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => view,
  )

async function readFile(): Promise<FileResult> {
  try {
    const res = await fetch(ENDPOINT)
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* not JSON: no writer here */
    }
    const isObj = typeof body === 'object' && body !== null && !Array.isArray(body)
    if (!isObj) return { status: 'unavailable' }
    if (res.ok) return { status: 'ok', data: body as Record<string, unknown> }
    const err = (body as { error?: unknown }).error
    if (res.status === 404 && err === 'not-found') return { status: 'not-found' }
    if (res.status === 422) return { status: 'corrupt' }
    return typeof err === 'string' ? { status: 'error' } : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}

let started = false

/** Once per page load. Autosave is held until the decision is made so it cannot overwrite an unread file. */
export async function startRestore(): Promise<void> {
  if (started) return
  started = true
  autosaver.suppress(true)
  let hold = false
  try {
    const file = await readFile()
    const a = decideStartup({
      local: getState(),
      localEmpty: storageWasBlank,
      file,
      currentFingerprint,
      itemsByBlock: Object.fromEntries(blocks.map((b) => [b.key, b.itemIds])),
    })
    switch (a.type) {
      case 'restore':
        actions.importJson(JSON.stringify({ app: 'cognitive-gym', state: a.incoming }))
        set({ notice: a.notice + (a.fingerprintChanged ? '.' + FP_WARN : '') })
        break
      case 'preview':
        set({ preview: { incoming: a.incoming, plan: a.plan, warn: a.fingerprintChanged ? FP_WARN : '' } })
        break
      case 'warn':
        set({ warning: WARN_TEXT[a.kind] })
        hold = a.suppressSaves
        break
      case 'write':
        break
    }
    if (!hold) autosaver.suppress(false)
    if (a.type === 'write') autosaver.saveNow()
  } catch {
    autosaver.suppress(false)
  }
}

/** Preview Confirm: merge locally, then save. Cancel (dismissPreview) changes no data. */
export function applyStartupPreview() {
  const p = view.preview
  if (!p) return
  actions.applyImport(p.incoming, p.plan)
  autosaver.saveNow()
  set({ preview: null, notice: 'Merged from the progress file.' + p.warn })
}

export const dismissPreview = () => set({ preview: null })
export const dismissNotice = () => set({ notice: null })
