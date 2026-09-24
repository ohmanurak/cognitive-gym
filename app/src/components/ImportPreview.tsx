import { affectedKeys, type MergePlan } from '../lib/merge'
import { blockByKey } from '../lib/structure'

const label = (key: string) => blockByKey.get(key)?.label ?? key

/** Preview of a per-Block import merge. Nothing changes until Confirm. */
export function ImportPreview({ plan, onConfirm, onCancel }: { plan: MergePlan; onConfirm: () => void; onCancel: () => void }) {
  const groups: [string, 'add' | 'replace' | 'keep', number][] = [
    ['added', 'add', plan.added],
    ['replaced with a newer version', 'replace', plan.replaced],
    ['kept because the local one is newer', 'keep', plan.kept],
  ]
  return (
    <div className="card">
      <h2>Import preview</h2>
      {groups.map(([text, kind, n]) => (
        <div key={kind}>
          <strong>{n}</strong> Blocks {text}
          {n > 0 && <span className="muted">: {affectedKeys(plan, kind).map(label).join(', ')}</span>}
        </div>
      ))}
      <div className="row">
        <button className="primary" onClick={onConfirm}>
          Confirm
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
