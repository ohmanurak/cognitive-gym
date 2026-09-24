import type { Item } from '../parser/parseWorkbook'

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

/** Old three-way hint, kept for existing callers. */
export function suggest(answer: string, expected: string[], open: boolean): 'full' | 'unsure' | 'none' {
  if (open || expected.length === 0) return 'none'
  const a = normalise(answer)
  if (!a) return 'unsure'
  return suggestParts(answer, expected, false, 0).status === 'full' ? 'full' : 'unsure'
}

// ---------- Suggestion (numeric core, parts, alternatives) ----------

export interface Suggestion {
  /** none: nothing checkable. full: all parts found. partial: some. unsure: none found. */
  status: 'none' | 'full' | 'partial' | 'unsure'
  found: number
  total: number
  /** Missing parts: a label like "part c" when the Key labels it, else the expected token. */
  missing: string[]
  /** round(points x found/total). Null for mixed Items. A hint only, never pre-selected. */
  hintScore: number | null
  /** Open Item with some checkable tokens: the rest is self-score. */
  mixed: boolean
}

/** What is stored per attempt at Commit time (silent tuning log). */
export type StoredSuggestion = Pick<Suggestion, 'found' | 'total' | 'hintScore'>

const MINUS = /[−‒–—]/g

/** Text form for case/punctuation-insensitive comparison. */
function textForm(s: string): string {
  return s
    .toLowerCase()
    .replace(MINUS, '-')
    .replace(/[*`_]/g, '')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/(^|[\s(])-(?=\d)/g, '$1neg')
    .replace(/->|=>/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function hasText(hay: string, needle: string): boolean {
  const n = textForm(needle)
  if (!n) return false
  return ` ${textForm(hay)} `.includes(` ${n} `)
}

interface Num {
  v: number
  pct: boolean
}

const NUM = /(^|[\s(=:≈~±])([-+]?)(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?(%?)/g

/** All numbers in a piece of text (thousands separators removed, unicode minus, fractions, percents). */
function numbersIn(s: string): Num[] {
  const t = s
    .replace(MINUS, '-')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
  const out: Num[] = []
  for (const m of t.matchAll(NUM)) {
    let v = parseFloat(m[3])
    if (m[4]) {
      const d = parseFloat(m[4])
      if (d === 0) continue
      v /= d
    }
    if (m[2] === '-') v = -v
    out.push({ v, pct: m[5] === '%' })
  }
  // A hyphen glued to a digit ("3-4") is a range, not a sign: the regex only takes a sign after a boundary.
  return out
}

/** Numeric candidates of a Key token: leading number, the number after an approx sign, a parenthesised one. */
function keyNumbers(token: string): Num[] {
  const t = token.replace(MINUS, '-').replace(/^\s*(approx\.?|about|~|≈|±)\s*/i, '')
  if (!/^[-+]?\d/.test(t)) return []
  const first = numbersIn(t)[0]
  const out = first ? [first] : []
  const tail = t.match(/≈\s*([-+]?[\d.,]+(?:\/\d+)?%?)/)
  if (tail) out.push(...numbersIn(tail[1]).slice(0, 1))
  const paren = t.match(/\(\s*([-+]?[\d.,]+%?)\s*\)/)
  if (paren) out.push(...numbersIn(paren[1]).slice(0, 1))
  return out
}

function close(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= Math.max(Math.abs(b) * tol, 1e-9)
}

function numMatches(key: Num, ans: Num, tol: number): boolean {
  const ks = key.pct ? [key.v, key.v / 100] : [key.v]
  const as = ans.pct ? [ans.v, ans.v / 100] : [ans.v]
  return ks.some((k) => as.some((a) => close(a, k, tol)))
}

/** One alternative (no `or`, no arrow) against a piece of answer text. */
function altMatches(alt: string, seg: string): boolean {
  const keys = keyNumbers(alt)
  if (keys.length) {
    const tol = /[≈~]|approx/i.test(alt) ? 0.01 : 0
    const nums = numbersIn(seg)
    return keys.some((k) => nums.some((n) => numMatches(k, n, tol)))
  }
  return hasText(seg, alt)
}

/** Alternatives of one token: `X or Y`, arrows (whole phrase or final value). */
function alternatives(token: string): string[] {
  const alts: string[] = []
  const orParts = token.split(/\s+or\s+/i)
  const shortParts = orParts.length > 1 && orParts.every((p) => p.trim().split(/\s+/).length <= 3)
  for (const p of shortParts ? orParts : [token]) alts.push(p.trim())
  for (const a of [...alts]) {
    if (/→|->/.test(a)) {
      const last = a.split(/→|->/).pop()!.trim().replace(/^(should be|is|=)\s+/i, '')
      if (last) alts.push(last)
    }
  }
  return alts
}

/** A token matches a segment: alternatives, and every semicolon part (any order). */
function tokenMatches(token: string, seg: string): boolean {
  const parts = token.split(/\s*;\s*/).filter(Boolean)
  return parts.every((p) => alternatives(p).some((alt) => altMatches(alt, seg)))
}

/** Split typed answer into parts: labels (a), a), a. then lines, semicolons, commas. */
export function splitParts(answer: string): string[] {
  const label = /(?:^|[\s,;])(?:\(([a-z]|[ivx]{1,4})\)|([a-z]|[ivx]{1,4})[.):])(?=\s|$)/gi
  const cuts: number[] = []
  for (const m of answer.matchAll(label)) {
    const at = m.index! + m[0].search(/\S/)
    cuts.push(at)
  }
  let segs: string[]
  if (cuts.length) {
    segs = []
    const first = answer.slice(0, cuts[0]).trim()
    if (first) segs.push(first)
    cuts.forEach((c, i) => segs.push(answer.slice(c, cuts[i + 1] ?? answer.length).trim()))
  } else {
    segs = answer.split(/\n+|;\s*|,\s+/)
  }
  return segs.map((s) => s.trim()).filter(Boolean)
}

/** Part label ("part c") for each expected token, read from the Key answer's bold marks. */
function labelsFor(keyAnswer: string | undefined, count: number): (string | null)[] {
  const none = Array<string | null>(count).fill(null)
  if (!keyAnswer) return none
  const out: (string | null)[] = []
  let last: string | null = null
  let pos = 0
  for (const m of keyAnswer.matchAll(/\*\*(.+?)\*\*/g)) {
    for (const l of keyAnswer.slice(pos, m.index).matchAll(/\(([a-z]|[ivx]{1,4})\)/gi)) last = `part ${l[1]}`
    pos = m.index! + m[0].length
    out.push(last)
  }
  return out.length === count ? out : none
}

/**
 * Suggestion for one answer against the Key's bold tokens. Tokens starting with
 * `or` are alternatives of the previous token. Never pre-selects a score.
 */
export function suggestParts(
  answer: string,
  expected: string[],
  open: boolean,
  points: number,
  keyAnswer?: string,
): Suggestion {
  const labels = labelsFor(keyAnswer, expected.length)
  const groups: { alts: string[]; label: string | null }[] = []
  expected.forEach((t, i) => {
    const m = t.match(/^or\s+(.+)$/i)
    if (m && groups.length) groups[groups.length - 1].alts.push(m[1])
    else groups.push({ alts: [t], label: labels[i] })
  })
  const total = groups.length
  if (total === 0) return { status: 'none', found: 0, total: 0, missing: [], hintScore: null, mixed: false }
  const mixed = open

  const whole = answer
  const segs = total > 1 ? splitParts(answer) : [answer]
  const used = new Array(segs.length).fill(false)
  const missing: string[] = []
  let found = 0
  for (const g of groups) {
    const hit = (seg: string) => g.alts.some((a) => tokenMatches(a, seg))
    let ok = false
    if (segs.length <= 1 || g.alts.some((a) => a.includes(';'))) {
      ok = hit(whole)
    } else {
      const i = segs.findIndex((s, j) => !used[j] && hit(s))
      if (i >= 0) {
        used[i] = true
        ok = true
      } else {
        // Text tokens are specific enough to find anywhere in the answer.
        ok = g.alts.every((a) => keyNumbers(a).length === 0) && hit(whole)
      }
    }
    if (ok) found++
    else missing.push(g.label ?? g.alts[0])
  }
  const status = !answer.trim() ? 'unsure' : found === total ? 'full' : found > 0 ? 'partial' : 'unsure'
  return {
    status,
    found,
    total,
    missing,
    hintScore: mixed ? null : Math.round((points * found) / total),
    mixed,
  }
}

/** Suggestion for an Item, or undefined when nothing is checkable (pure open / rubric). */
export function suggestionFor(item: Item, answer: string): Suggestion | undefined {
  const key = item.key
  if (!key || key.expected.length === 0) return undefined
  const s = suggestParts(answer, key.expected, key.open, item.points, key.answer)
  return s.status === 'none' ? undefined : s
}

/** The subset stored on an attempt at Commit time. */
export function storedSuggestion(item: Item, answer: string): StoredSuggestion | undefined {
  const s = suggestionFor(item, answer)
  return s && { found: s.found, total: s.total, hintScore: s.hintScore }
}

/** Human hint text for the Review line. */
export function hintText(s: Suggestion | undefined, open: boolean): string {
  if (!s) return open ? ' (rubric, self-score)' : ''
  const miss = s.missing.length ? `, missing ${s.missing.join(', ')}` : ''
  const count = `found ${s.found} of ${s.total}${miss}`
  if (s.mixed) return ` (${count}; rest is self-score)`
  if (s.status === 'full') return ` (looks correct: ${count})`
  const hint = s.hintScore != null ? `; hint ${s.hintScore}` : ''
  return ` (${count}${hint})`
}
