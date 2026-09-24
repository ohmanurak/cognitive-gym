import { actions } from '../lib/store'
import { isMultiStep } from '../lib/wmi'
import type { Attempt } from '../lib/state'
import type { Item } from '../parser/parseWorkbook'

/** Review toggle for WM Items: needed four or more dependent steps. Defaults to the workbook tag. */
export function MultiStepToggle({ item, attempt }: { item: Item; attempt: Attempt }) {
  if (item.skill !== 'WM') return null
  const on = isMultiStep(attempt, item.multiStepTag)
  return (
    <label className="small row" style={{ marginTop: 8, gap: 6 }}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => actions.mark(item.id, { multiStep: e.target.checked })}
      />
      Needed four or more dependent steps (multi-step)
    </label>
  )
}
