import { actions, type Attempt } from '../lib/store'
import { dimsTotal, normDims, RUBRIC_LABELS, setDim } from '../lib/rubric'
import type { Item } from '../parser/parseWorkbook'

/** Five 0-2 Rubric dimension rows; completing them writes the derived score (still overridable). */
export function RubricDims({ item, attempt }: { item: Item; attempt: Attempt }) {
  const labels = RUBRIC_LABELS[item.skill]!
  const dims = normDims(attempt.dims)
  const total = dimsTotal(dims)
  return (
    <div style={{ marginTop: 10 }}>
      <div className="small muted">
        Rubric dimensions (0-2 each){total != null && ` · total ${total}/10 → ${attempt.score ?? '?'}/${item.points} pts`}
      </div>
      {labels.map((label, i) => (
        <div className="row" key={label} style={{ marginTop: 4 }}>
          <span className="small" style={{ flex: 1, minWidth: 180 }}>
            {label}
          </span>
          {[0, 1, 2].map((n) => (
            <button
              key={n}
              className={dims[i] === n ? 'on' : ''}
              onClick={() => {
                const r = setDim(attempt.dims, i, n, item.points)
                actions.mark(item.id, r.score == null ? { dims: r.dims } : { dims: r.dims, score: r.score })
              }}
            >
              {n}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
