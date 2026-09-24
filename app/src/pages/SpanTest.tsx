import { useEffect, useRef, useState } from 'react'
import { actions, useStore } from '../lib/store'
import { baselineSpanDone, buildLadder, isComplete, reliableSpan, type LadderStep, type SpanTestKind } from '../lib/spantest'

type Phase = 'idle' | 'showing' | 'recall' | 'done'

/** Counted Span test: full ladder, no feedback until it ends. Leaving midway abandons it. */
export function SpanTestPage() {
  const s = useStore()
  const [phase, setPhase] = useState<Phase>('idle')
  const [ladder, setLadder] = useState<LadderStep[]>([])
  const [step, setStep] = useState(0)
  const [testId, setTestId] = useState<string | null>(null)
  const [shown, setShown] = useState('')
  const [input, setInput] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    actions.abandonSpanTests()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      actions.abandonSpanTests()
    }
  }, [])

  function present(seq: string) {
    setInput('')
    setPhase('showing')
    let i = 0
    const tick = () => {
      if (i < seq.length) {
        setShown(seq[i])
        i++
        timer.current = setTimeout(() => {
          setShown('')
          timer.current = setTimeout(tick, 250)
        }, 800)
      } else {
        setShown('')
        setPhase('recall')
      }
    }
    timer.current = setTimeout(tick, 600)
  }

  function begin(kind: SpanTestKind) {
    const l = buildLadder(kind)
    setLadder(l)
    setStep(0)
    setTestId(actions.startSpanTest(kind))
    present(l[0].sequence)
  }

  function submit() {
    if (!testId) return
    actions.addSpanTrial(testId, ladder[step], input)
    if (step + 1 >= ladder.length) {
      setPhase('done')
    } else {
      setStep(step + 1)
      present(ladder[step + 1].sequence)
    }
  }

  const done = baselineSpanDone(s.spanTests)
  const finished = testId ? s.spanTests.find((t) => t.id === testId) : undefined
  const cur = ladder[step]

  return (
    <div>
      <h1>Baseline · Span test</h1>
      <div className="muted">
        Forward lengths 4-9, then backward lengths 3-7, two sequences each. You always do the full ladder. Right or wrong is hidden until the end. Leaving midway abandons the test: it is kept in your data but never counts.
      </div>

      <div className="card">
        {phase === 'idle' && (
          <div className="row">
            <button className="primary" onClick={() => begin(done ? 'retest' : 'baseline')}>
              {done ? 'Start retest (random sequences)' : 'Start Baseline Span test'}
            </button>
            <span className="muted small">{done ? 'Baseline recorded. Retests never change done vs left.' : 'Counts as 2 progress units.'}</span>
          </div>
        )}
        {(phase === 'showing' || phase === 'recall') && cur && (
          <>
            <div className="muted small">
              {cur.direction === 'forward' ? 'Forward' : 'Backward'} · length {cur.length} · try {cur.attempt} · step {step + 1} of {ladder.length}
            </div>
            <div className="digit">{phase === 'showing' ? shown : ''}</div>
            {phase === 'showing' && <div className="muted">Watch…</div>}
            {phase === 'recall' && (
              <div className="row">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  placeholder={cur.direction === 'forward' ? 'Digits in order' : 'Digits in reverse order'}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  style={{ maxWidth: 280 }}
                />
                <button className="primary" onClick={submit}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
        {phase === 'done' && finished && isComplete(finished) && (
          <div>
            <b>Ladder finished.</b> Reliable span: forward {reliableSpan(finished, 'forward') || '·'} · backward {reliableSpan(finished, 'backward') || '·'}
            <div className="row" style={{ marginTop: 8 }}>
              <a className="btn" href="#/stats">
                Progress
              </a>
              <button
                onClick={() => {
                  setPhase('idle')
                  setTestId(null)
                }}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
