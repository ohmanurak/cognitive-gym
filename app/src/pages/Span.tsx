import { useEffect, useRef, useState } from 'react'
import { longestReliableSpan } from '../lib/metrics'
import { actions, useStore, type SpanTry } from '../lib/store'

type Phase = 'idle' | 'showing' | 'recall' | 'result'

function randomDigits(n: number): string {
  let out = ''
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10)
  return out
}

export function Span() {
  const s = useStore()
  const [direction, setDirection] = useState<SpanTry['direction']>('forward')
  const [length, setLength] = useState(4)
  const [phase, setPhase] = useState<Phase>('idle')
  const [seq, setSeq] = useState('')
  const [shown, setShown] = useState('')
  const [input, setInput] = useState('')
  const [ok, setOk] = useState<boolean | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function start() {
    const d = randomDigits(length)
    setSeq(d)
    setInput('')
    setOk(null)
    setPhase('showing')
    let i = 0
    const tick = () => {
      if (i < d.length) {
        setShown(d[i])
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

  function check() {
    const want = direction === 'forward' ? seq : [...seq].reverse().join('')
    const correct = input.replace(/\s/g, '') === want
    setOk(correct)
    setPhase('result')
    actions.addSpan({ at: Date.now(), direction, length, correct })
  }

  const fwd = longestReliableSpan(s.spans, 'forward')
  const bwd = longestReliableSpan(s.spans, 'backward')

  return (
    <div>
      <h1>Digit span trainer</h1>
      <div className="muted">
        Workbook Baseline 2A/2B. Digits appear one at a time. A length counts as reliable when your last two tries at it are both right. The backward span feeds the Working-Memory Index.
      </div>

      <div className="card">
        <div className="row">
          <button className={direction === 'forward' ? 'on' : ''} onClick={() => setDirection('forward')} disabled={phase === 'showing'}>
            Forward
          </button>
          <button className={direction === 'backward' ? 'on' : ''} onClick={() => setDirection('backward')} disabled={phase === 'showing'}>
            Backward
          </button>
          <label className="row">
            Length
            <input
              type="number"
              min={2}
              max={12}
              value={length}
              onChange={(e) => setLength(Math.max(2, Math.min(12, Number(e.target.value) || 4)))}
              style={{ width: 70 }}
              disabled={phase === 'showing'}
            />
          </label>
          <span className="grow" />
          <span className="muted small">
            Reliable: forward {fwd || '·'} · backward {bwd || '·'}
          </span>
        </div>

        <div className="digit">{phase === 'showing' ? shown : phase === 'result' ? seq : ''}</div>

        {phase === 'idle' && (
          <button className="primary" onClick={start}>
            Start
          </button>
        )}
        {phase === 'showing' && <div className="muted">Watch…</div>}
        {phase === 'recall' && (
          <div className="row">
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              placeholder={direction === 'forward' ? 'Digits in order' : 'Digits in reverse order'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && check()}
              style={{ maxWidth: 280 }}
            />
            <button className="primary" onClick={check}>
              Check
            </button>
          </div>
        )}
        {phase === 'result' && (
          <div className="row">
            <b style={{ color: ok ? 'var(--good)' : 'var(--bad)' }}>{ok ? 'Correct' : 'Wrong'}</b>
            <span className="muted">
              Sequence {seq}
              {direction === 'backward' && ` · reversed ${[...seq].reverse().join('')}`}
            </span>
            <span className="grow" />
            <button
              className="primary"
              onClick={() => {
                if (ok) setLength((l) => Math.min(12, l + 1))
                setPhase('idle')
              }}
            >
              {ok ? 'Longer' : 'Again'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
