/** Normalise an answer for loose comparison: case, commas, spacing, bold/backtick marks. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*`_]/g, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/[\s,;:]+/g, ' ')
    .replace(/\s*([=+\-×÷/^()])\s*/g, '$1')
    .trim()
}

/**
 * Suggest a mark from the key's bold tokens. Returns 'full' only when every
 * expected token appears in the answer; 'none' when no key token is checkable;
 * otherwise 'unsure'. The learner always confirms.
 */
export function suggest(answer: string, expected: string[], open: boolean): 'full' | 'unsure' | 'none' {
  if (open || expected.length === 0) return 'none'
  const a = normalise(answer)
  if (!a) return 'unsure'
  const all = expected.every((t) => a.includes(normalise(t)))
  return all ? 'full' : 'unsure'
}
