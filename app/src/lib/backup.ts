import { markExported } from './backupMeta'
import { findOrphans, weeksCompleted, workbookFingerprint } from './integrity'
import { blockStatus } from './metrics'
import { actions, getState } from './store'
import { blocks, workbook } from './structure'

export const currentFingerprint = workbookFingerprint(workbook.items)

export function currentWeeksCompleted(): number {
  const s = getState()
  return weeksCompleted(
    blocks
      .filter((b) => b.week !== null)
      .map((b) => ({ week: b.week as number, complete: ['committed', 'done'].includes(blockStatus(s, b)) })),
  )
}

export const orphansNow = () =>
  findOrphans(getState(), workbook.items.map((i) => i.id), blocks.map((b) => b.key))

/** Download the export file and record it as the latest backup. */
export function downloadExport() {
  const blob = new Blob([actions.exportJson()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `cognitive-gym-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  markExported(currentWeeksCompleted())
}

/** Ask the browser not to evict our storage. Best effort. */
export function requestPersistence() {
  try {
    void navigator.storage?.persist?.().catch(() => {})
  } catch {
    /* ignore */
  }
}
