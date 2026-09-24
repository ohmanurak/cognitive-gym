/**
 * Per-Block import merge. Pure: no storage, no clock, inputs never mutated.
 *
 * A Block merges as a unit: its Items' attempts and its BlockState come from
 * exactly one side. Rules:
 * - Only incoming has a committed Block: `add`.
 * - Both committed: later latest `committedAt` wins (`replace` / `keep`). Equal time:
 *   identical attempts = `same`, otherwise local is kept.
 * - Local Block started but not committed (clock, drafts, retry round): kept untouched (`busy`).
 *   Incoming uncommitted Blocks are ignored.
 * - Span tests: union by id (local wins a clash). Old `spans`: union by timestamp.
 * - Reflections: union by key; on a clash the non-empty local text wins (no timestamps to compare).
 * - Orphans (Items not in any known Block, Blocks unknown to the workbook): never dropped.
 *   Unknown Blocks merge by the same rules; orphan Item attempts are unioned by Item id, local wins.
 * - Error-code/Fix fields live on the Attempt, so they travel with it.
 */
import { blockState, type State } from './state'

export type MergeAction = 'add' | 'replace' | 'keep' | 'same' | 'busy'

export interface MergePlan {
  /** Decision per Block key, only for Blocks where the incoming file has a committed round. */
  actions: Record<string, MergeAction>
  added: number
  replaced: number
  kept: number
  /** Item ids per Block key, so apply moves a Block's attempts as one unit. */
  itemsByBlock: Record<string, string[]>
}

const isCommitted = (s: State, key: string) => blockState(s, key).committed
const latest = (s: State, key: string) => Math.max(0, ...blockState(s, key).committedAt)

/** Local Block that was started but not committed. */
function isBusy(s: State, key: string, items: string[]): boolean {
  const b = s.blocks[key]
  if (!b || b.committed) return false
  return (
    b.round > 1 ||
    b.elapsedMs > 0 ||
    b.startedAt !== null ||
    (b.committedAt?.length ?? 0) > 0 ||
    items.some((id) => s.drafts[id] || s.attempts[id]?.length)
  )
}

const sameAttempts = (a: State, b: State, items: string[]) =>
  items.every((id) => JSON.stringify(a.attempts[id] ?? []) === JSON.stringify(b.attempts[id] ?? []))

/** itemsByBlock: every Block key known to the workbook mapped to its Item ids. Keys absent here are orphans. */
export function planMerge(local: State, incoming: State, itemsByBlock: Record<string, string[]>): MergePlan {
  const actions: Record<string, MergeAction> = {}
  const items: Record<string, string[]> = { ...itemsByBlock }
  let added = 0
  let replaced = 0
  let kept = 0
  for (const key of Object.keys(incoming.blocks ?? {})) {
    if (!isCommitted(incoming, key)) continue
    const ids = itemsByBlock[key] ?? []
    items[key] = ids
    let act: MergeAction
    if (isBusy(local, key, ids)) act = 'busy'
    else if (!isCommitted(local, key)) act = 'add'
    else {
      const l = latest(local, key)
      const i = latest(incoming, key)
      if (i > l) act = 'replace'
      else if (i === l && sameAttempts(local, incoming, ids)) act = 'same'
      else act = 'keep'
    }
    actions[key] = act
    if (act === 'add') added++
    else if (act === 'replace') replaced++
    else if (act === 'keep') kept++
  }
  return { actions, added, replaced, kept, itemsByBlock: items }
}

export function applyMerge(local: State, incoming: State, plan: MergePlan): State {
  const attempts = { ...local.attempts }
  const blocks = { ...local.blocks }
  for (const [key, act] of Object.entries(plan.actions)) {
    if (act !== 'add' && act !== 'replace') continue
    blocks[key] = incoming.blocks[key]
    for (const id of plan.itemsByBlock[key] ?? []) {
      if (incoming.attempts?.[id]) attempts[id] = incoming.attempts[id]
      else delete attempts[id]
    }
  }
  // Orphan Items (in no known Block): keep everything, local wins a clash.
  const known = new Set(Object.values(plan.itemsByBlock).flat())
  for (const [id, list] of Object.entries(incoming.attempts ?? {})) {
    if (!known.has(id) && !attempts[id]) attempts[id] = list
  }
  const spanTests = [...(local.spanTests ?? [])]
  const ids = new Set(spanTests.map((t) => t.id))
  for (const t of incoming.spanTests ?? []) if (!ids.has(t.id)) spanTests.push(t)
  spanTests.sort((a, b) => a.startedAt - b.startedAt)
  const spans = [...(local.spans ?? [])]
  const ats = new Set(spans.map((t) => t.at))
  for (const t of incoming.spans ?? []) if (!ats.has(t.at)) spans.push(t)
  spans.sort((a, b) => a.at - b.at)
  const reflections = { ...local.reflections }
  for (const [k, v] of Object.entries(incoming.reflections ?? {})) if (!reflections[k]) reflections[k] = v
  return { ...local, attempts, blocks, spanTests, spans, reflections }
}

/** Blocks whose incoming version will be applied, for the preview label list. */
export const affectedKeys = (plan: MergePlan, kind: 'add' | 'replace' | 'keep') =>
  Object.entries(plan.actions).filter(([, a]) => a === kind).map(([k]) => k)
