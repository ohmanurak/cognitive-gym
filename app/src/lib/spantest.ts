// Span test: full fixed ladder, two attempts per length, no stop rule, results hidden until the end.
// Pure functions only; the store persists SpanTest records in State.spanTests.

export type SpanDirection = 'forward' | 'backward'
export type SpanTestKind = 'baseline' | 'retest'

export interface SpanTrial {
  direction: SpanDirection
  length: number
  attempt: 1 | 2
  sequence: string
  response: string
  correct: boolean
}

export interface SpanTest {
  id: string
  kind: SpanTestKind
  startedAt: number
  /** Set when the last rung is answered; null while running or abandoned. */
  finishedAt: number | null
  /** Started but left unfinished. Discarded for WMI, kept in the export. */
  abandoned?: boolean
  trials: SpanTrial[]
}

export interface LadderStep {
  direction: SpanDirection
  length: number
  attempt: 1 | 2
  sequence: string
}

export const FORWARD_LENGTHS = [4, 5, 6, 7, 8, 9]
export const BACKWARD_LENGTHS = [3, 4, 5, 6, 7]

/** Workbook Baseline 2A/2B sequences [attempt 1, attempt 2] by length (verified by a test). */
export const BASELINE_SEQUENCES: Record<SpanDirection, Record<number, [string, string]>> = {
  forward: {
    4: ['5260', '9083'],
    5: ['31860', '08246'],
    6: ['075291', '472803'],
    7: ['4862057', '6492083'],
    8: ['57249208', '50749528'],
    9: ['390424861', '937293068'],
  },
  backward: {
    3: ['308', '051'],
    4: ['5942', '5947'],
    5: ['24180', '29048'],
    6: ['850273', '194260'],
    7: ['7096825', '0281957'],
  },
}

export function randomDigits(n: number, rng: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < n; i++) out += Math.floor(rng() * 10)
  return out
}

/** Forward rungs then backward rungs, two attempts each. Baseline is fixed, retests are random. */
export function buildLadder(kind: SpanTestKind, rng: () => number = Math.random): LadderStep[] {
  const steps: LadderStep[] = []
  for (const direction of ['forward', 'backward'] as const) {
    const lengths = direction === 'forward' ? FORWARD_LENGTHS : BACKWARD_LENGTHS
    for (const length of lengths) {
      for (const attempt of [1, 2] as const) {
        const sequence =
          kind === 'baseline' ? BASELINE_SEQUENCES[direction][length][attempt - 1] : randomDigits(length, rng)
        steps.push({ direction, length, attempt, sequence })
      }
    }
  }
  return steps
}

export const LADDER_SIZE = buildLadder('baseline').length

export function expectedAnswer(step: { direction: SpanDirection; sequence: string }): string {
  return step.direction === 'forward' ? step.sequence : [...step.sequence].reverse().join('')
}

export function startSpanTest(id: string, kind: SpanTestKind, now: number): SpanTest {
  return { id, kind, startedAt: now, finishedAt: null, trials: [] }
}

/** Record one rung. No feedback is derived here; the test finishes after the last rung. */
export function recordTrial(test: SpanTest, step: LadderStep, response: string, now: number): SpanTest {
  if (test.finishedAt !== null || test.abandoned) return test
  const trial: SpanTrial = {
    direction: step.direction,
    length: step.length,
    attempt: step.attempt,
    sequence: step.sequence,
    response,
    correct: response.replace(/\s/g, '') === expectedAnswer(step),
  }
  const trials = [...test.trials, trial]
  return { ...test, trials, finishedAt: trials.length >= LADDER_SIZE ? now : null }
}

/** Mark every unfinished test abandoned (leaving the ladder midway forfeits it). */
export function abandonOpen(tests: SpanTest[]): SpanTest[] {
  if (!tests.some((t) => t.finishedAt === null && !t.abandoned)) return tests
  return tests.map((t) => (t.finishedAt === null && !t.abandoned ? { ...t, abandoned: true } : t))
}

export const isComplete = (t: SpanTest) => t.finishedAt !== null && !t.abandoned

/** Longest length where both attempts were correct; 0 if none. */
export function reliableSpan(test: SpanTest, direction: SpanDirection): number {
  const byLen = new Map<number, boolean[]>()
  for (const t of test.trials) {
    if (t.direction === direction) byLen.set(t.length, [...(byLen.get(t.length) ?? []), t.correct])
  }
  let best = 0
  for (const [len, r] of byLen) if (r.length === 2 && r.every(Boolean)) best = Math.max(best, len)
  return best
}

/** Latest complete Span test finished on or before atMs; null if none. */
export function spanAsOf(tests: SpanTest[], atMs: number): { forward: number; backward: number } | null {
  let best: SpanTest | null = null
  for (const t of tests) {
    if (!isComplete(t) || t.finishedAt! > atMs) continue
    if (!best || t.finishedAt! >= best.finishedAt!) best = t
  }
  return best && { forward: reliableSpan(best, 'forward'), backward: reliableSpan(best, 'backward') }
}

/** Baseline Span test Block is done once a complete baseline test exists. */
export const baselineSpanDone = (tests: SpanTest[]) => tests.some((t) => t.kind === 'baseline' && isComplete(t))
