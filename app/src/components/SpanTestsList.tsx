import { useStore } from '../lib/store'
import { isComplete, reliableSpan } from '../lib/spantest'

/** Progress page list of complete Span tests: date, forward and backward Reliable span. */
export function SpanTestsList() {
  const s = useStore()
  const tests = s.spanTests.filter(isComplete).sort((a, b) => a.finishedAt! - b.finishedAt!)
  return (
    <>
      <h2>Span tests</h2>
      <div className="card">
        {tests.length === 0 ? (
          <div className="small muted">
            No complete Span test yet. <a href="#/block/base:2span">Take the Baseline Span test</a>.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Kind</th>
                <th className="num">Forward</th>
                <th className="num">Backward</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.finishedAt!).toLocaleDateString()}</td>
                  <td>{t.kind}</td>
                  <td className="num">{reliableSpan(t, 'forward') || '·'}</td>
                  <td className="num">{reliableSpan(t, 'backward') || '·'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="small muted" style={{ marginTop: 8 }}>
          Reliable span = longest length with both attempts right. Abandoned ladders are not listed and do not count.
        </div>
      </div>
    </>
  )
}
