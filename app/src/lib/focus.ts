import type { Item, Skill } from '../parser/parseWorkbook'
import { firstAttempt } from './metrics'
import { ERROR_CODES, type ErrorCode, type State } from './state'
import { itemById } from './structure'

/** Error codes that signal a reasoning failure rather than a slip; their misses weigh ×1.5. */
const CONCEPTUAL: ErrorCode[] = ['H', 'A', 'R', 'L']
const CONCEPTUAL_WEIGHT = 1.5
/** A group needs this many misses before it ranks; fewer is Provisional. */
const MIN_MISSES = 3
/** A miss loses half its weight every this many weeks behind the current week. */
const HALF_LIFE_WEEKS = 2
/** Boost when a group misses again in a week after one of its misses got a Fix. */
const FIX_NOT_WORKING_BOOST = 1.5

export interface Focus {
  code: ErrorCode
  name: string
  score: number
  misses: number
  pointsLost: number
  /** Misses per Skill. */
  skills: Partial<Record<Skill, number>>
  /** Distinct weeks with a miss, ascending (Baseline 0, Final Examination 13). */
  weeks: number[]
  fixNotWorking: boolean
  provisional: boolean
  itemIds: string[]
}

export interface FocusRanking {
  /** Ranked Focus groups (3+ misses), highest score first. */
  focus: Focus[]
  /** Groups with too few misses to rank, highest score first. */
  provisional: Focus[]
  /** First-attempt misses with no Error code yet. */
  uncoded: number
}

interface Miss {
  id: string
  week: number
  skill: Skill
  code: ErrorCode
  lost: number
  hasFix: boolean
}

/** Baseline is week 0 and the Final Examination week 13. */
function weekOf(item: Item): number {
  return item.stage === 'baseline' ? 0 : item.stage === 'final' ? 13 : (item.week ?? 0)
}

/**
 * The Error profile: rank Error codes by coded first-attempt misses, weighting
 * each miss by points lost, ×1.5 for conceptual codes, and halving every
 * two weeks behind the current week (the highest week with a scored attempt).
 * `asOfWeek` ignores every later week, as if the clock stopped there.
 * A group whose Fix did not stop it (it missed again in a later week) is boosted ×1.5.
 */
export function rankFocus(s: State, asOfWeek?: number): FocusRanking {
  const groups = new Map<ErrorCode, Miss[]>()
  let uncoded = 0
  let current = 0
  for (const id of Object.keys(s.attempts)) {
    const item = itemById.get(id)
    const a = firstAttempt(s, id)
    if (!item || !a || a.score == null) continue
    const week = weekOf(item)
    if (asOfWeek != null && week > asOfWeek) continue
    current = Math.max(current, week)
    if (a.score >= item.points) continue
    if (!a.errorCode) {
      uncoded++
      continue
    }
    const list = groups.get(a.errorCode) ?? []
    list.push({ id, week, skill: item.skill, code: a.errorCode, lost: item.points - a.score, hasFix: !!a.fix?.trim() })
    groups.set(a.errorCode, list)
  }

  const all: Focus[] = []
  for (const [code, list] of groups) {
    let score = 0
    const skills: Partial<Record<Skill, number>> = {}
    for (const m of list) {
      const recency = 0.5 ** ((current - m.week) / HALF_LIFE_WEEKS)
      score += m.lost * (CONCEPTUAL.includes(code) ? CONCEPTUAL_WEIGHT : 1) * recency
      skills[m.skill] = (skills[m.skill] ?? 0) + 1
    }
    const fixWeeks = list.filter((m) => m.hasFix).map((m) => m.week)
    const fixNotWorking = fixWeeks.length > 0 && list.some((m) => m.week > Math.min(...fixWeeks))
    if (fixNotWorking) score *= FIX_NOT_WORKING_BOOST
    all.push({
      code,
      name: ERROR_CODES.find((c) => c.code === code)?.name ?? code,
      score,
      misses: list.length,
      pointsLost: list.reduce((n, m) => n + m.lost, 0),
      skills,
      weeks: [...new Set(list.map((m) => m.week))].sort((a, b) => a - b),
      fixNotWorking,
      provisional: list.length < MIN_MISSES,
      itemIds: list.map((m) => m.id),
    })
  }
  all.sort((a, b) => b.score - a.score)
  return { focus: all.filter((f) => !f.provisional), provisional: all.filter((f) => f.provisional), uncoded }
}
