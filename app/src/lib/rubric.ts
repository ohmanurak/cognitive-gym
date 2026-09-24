import type { Item } from '../parser/parseWorkbook'

/** Rubric dimensions (Workbook §0.8) for open Items of these skills, each scored 0-2. */
export const RUBRIC_LABELS: Partial<Record<Item['skill'], string[]>> = {
  AB: ['Local pattern', 'General rule', 'Generalisation', 'Alternative representation', 'Limitations'],
  HT: [
    'Number of distinct hypotheses',
    'Quality of predictions',
    'Falsifiability',
    'Discrimination',
    'Information value of test',
  ],
}

export type Dims = (number | null)[]

/** True for open (rubric-scored) AB and HT Items. */
export function hasRubric(item: Item): boolean {
  return !!item.key?.open && RUBRIC_LABELS[item.skill] !== undefined
}

/** Five slots, null = unset. */
export function normDims(dims: Dims | undefined): Dims {
  return Array.from({ length: 5 }, (_, i) => dims?.[i] ?? null)
}

export function dimsComplete(dims: Dims | undefined): dims is number[] {
  return !!dims && dims.length === 5 && dims.every((d) => d != null && d >= 0 && d <= 2)
}

/** Total 0-10, or null until all five dimensions are set. */
export function dimsTotal(dims: Dims | undefined): number | null {
  return dimsComplete(dims) ? dims.reduce((a, b) => a + b, 0) : null
}

/** Item points derived from the total: round(points x total / 10) to a whole point. */
export function derivedScore(points: number, total: number): number {
  return Math.round((points * total) / 10)
}

/** Set one dimension; returns new dims and the derived score once complete (else null). */
export function setDim(dims: Dims | undefined, index: number, value: number, points: number) {
  const next = normDims(dims)
  next[index] = value
  const total = dimsTotal(next)
  return { dims: next, score: total == null ? null : derivedScore(points, total) }
}
