/**
 * Coach me: the request payload for a Focus diagnosis and the saved Coaching note shape.
 * Pure: no fetch, no clock. The dev server (`server/coach.ts`) makes the call.
 */
import type { Skill } from '../parser/parseWorkbook'
import type { Focus } from './focus'
import { firstAttempt } from './metrics'
import type { ErrorCode, State } from './state'
import { itemById, workbook } from './structure'

/** How many of a Focus's latest misses go into one diagnosis. */
export const COACH_MISSES = 5

/** The Workbook's §0.4 "Typical signature" per Error code. */
export const ERROR_CODE_DEFINITIONS: Record<ErrorCode, string> = {
  P: 'Oh — I never noticed the alternation / the invariant.',
  R: 'Wrong table, wrong variables, wrong picture; solved a different problem.',
  A: 'Fit the examples but could not state or generalise the rule; overfitted.',
  WM: 'Lost an intermediate value, a constraint, or an earlier step.',
  H: 'Committed to the first idea; never generated a rival; no falsification test.',
  L: 'Invalid inference (affirming the consequent, quantifier slip, base-rate neglect).',
  C: 'Correct method, arithmetic slip.',
  S: 'Right in unlimited time, wrong (or skipped) under the clock.',
  K: 'Missing definition or fact (e.g. what a "confounder" is).',
}

export interface CoachMiss {
  id: string
  week: number
  skill: Skill
  points: number
  score: number
  item: string
  answer: string
  key: { answer: string; derivation: string; trap: string } | null
  conCar: 'Con' | 'Car' | null
  failedAssumption: string | null
  fix: string | null
}

export interface CoachPayload {
  focus: {
    code: ErrorCode
    name: string
    definition: string
    misses: number
    pointsLost: number
    weeks: number[]
    fixNotWorking: boolean
  }
  misses: CoachMiss[]
  basedOn: { id: string; week: number }[]
}

const weekOf = (id: string) => {
  const it = itemById.get(id)
  return !it ? 0 : it.stage === 'baseline' ? 0 : it.stage === 'final' ? 13 : (it.week ?? 0)
}
const order = new Map(workbook.items.map((it, i) => [it.id, i]))

/**
 * The latest COACH_MISSES coded first-attempt misses of the Focus code, newest week first
 * (later workbook Items first within a week). Only scored Items are sent: a score exists
 * only after the Block was Committed and the Key seen (Discipline Rule).
 */
export function buildCoachPayload(s: State, focus: Focus): CoachPayload {
  const ids = Object.keys(s.attempts).filter((id) => {
    const a = firstAttempt(s, id)
    const it = itemById.get(id)
    return !!it && !!a && a.score != null && a.score < it.points && a.errorCode === focus.code
  })
  ids.sort((a, b) => weekOf(b) - weekOf(a) || (order.get(b) ?? 0) - (order.get(a) ?? 0))
  const misses = ids.slice(0, COACH_MISSES).map((id): CoachMiss => {
    const it = itemById.get(id)!
    const a = firstAttempt(s, id)!
    return {
      id,
      week: weekOf(id),
      skill: it.skill,
      points: it.points,
      score: a.score!,
      item: it.body,
      answer: a.answer,
      key: it.key ? { answer: it.key.answer, derivation: it.key.derivation, trap: it.key.trap } : null,
      conCar: a.nature ?? null,
      failedAssumption: a.assumption?.trim() || null,
      fix: a.fix?.trim() || null,
    }
  })
  return {
    focus: {
      code: focus.code,
      name: focus.name,
      definition: ERROR_CODE_DEFINITIONS[focus.code],
      misses: focus.misses,
      pointsLost: focus.pointsLost,
      weeks: focus.weeks,
      fixNotWorking: focus.fixNotWorking,
    },
    misses,
    basedOn: misses.map(({ id, week }) => ({ id, week })),
  }
}
