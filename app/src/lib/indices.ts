/** Formulas from Workbook §0.8. Indices are training-progress indicators, not IQ. */

/** PI = Accuracy% × (0.70 + 0.30 × S); S = min(1, target/actual) when accuracy ≥ 75%, else 0. */
export function patternIndex(accuracyPct: number, targetMin: number, actualMin: number): number {
  const s = accuracyPct >= 75 ? Math.min(1, targetMin / actualMin) : 0
  return accuracyPct * (0.7 + 0.3 * s)
}

/** AI / HI = (mean rubric score ÷ 10) × 100, where each problem scores 0–10. */
export function rubricIndex(scoresOutOf10: number[]): number | null {
  if (scoresOutOf10.length === 0) return null
  const mean = scoresOutOf10.reduce((a, b) => a + b, 0) / scoresOutOf10.length
  return (mean / 10) * 100
}

/** WMI = 100 × [0.20·min(1, span/8) + 0.40·manipulation + 0.40·multiStep]; accuracies in 0–1. */
export function workingMemoryIndex(span: number, manipulation: number, multiStep: number): number {
  return 100 * (0.2 * Math.min(1, span / 8) + 0.4 * manipulation + 0.4 * multiStep)
}

/** Efficiency = correct answers per minute. */
export function efficiency(correct: number, minutes: number): number | null {
  return minutes > 0 ? correct / minutes : null
}

/**
 * Efficiency gains only count when accuracy ≥ 75% and has not dropped
 * more than 5 percentage points below the Baseline.
 */
export function efficiencyCounts(accuracyPct: number, baselineAccuracyPct: number): boolean {
  return accuracyPct >= 75 && accuracyPct >= baselineAccuracyPct - 5
}

export interface CalibrationBucket {
  confidence: number
  n: number
  accuracy: number | null
}

/** Accuracy per confidence rating. Input pairs are (confidence 1–5, correct?). */
export function calibration(pairs: { confidence: number; correct: boolean }[]): CalibrationBucket[] {
  return [1, 2, 3, 4, 5].map((c) => {
    const rows = pairs.filter((p) => p.confidence === c)
    return {
      confidence: c,
      n: rows.length,
      accuracy: rows.length ? rows.filter((r) => r.correct).length / rows.length : null,
    }
  })
}
