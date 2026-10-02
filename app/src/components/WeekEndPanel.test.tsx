// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Attempt, ErrorCode } from '../lib/state'
import { actions, getState, useStore } from '../lib/store'
import { blocks } from '../lib/structure'
import { reflectionQuestions, weekEnd } from '../lib/weekend'
import { WeekEndPanel } from './WeekEndPanel'

const W = 1

type Miss = [code: ErrorCode, fix?: string, week?: number]

/**
 * Week 1 with every Block committed and every Item full marks, except the given
 * misses, which land on Day 1-5 Items of their Week (default 1), so Day 6 error analysis is complete.
 */
function seed(misses: Miss[]) {
  const attempts: Record<string, Attempt[]> = {}
  const stateBlocks: Record<string, unknown> = {}
  for (const d of blocks.filter((b) => b.week === W)) {
    stateBlocks[d.key] = {
      round: 1,
      committed: true,
      startedAt: null,
      elapsedMs: 0,
      snapshot: null,
      roundElapsed: [1000],
      committedAt: [1000],
    }
    for (const id of d.itemIds) attempts[id] = [{ round: 1, answer: 'x', confidence: 3, score: 99 } as Attempt]
  }
  const used = new Set<string>()
  for (const [errorCode, fix, week = W] of misses) {
    const id = blocks
      .filter((b) => b.week === week && b.day != null && b.day < 6)
      .flatMap((b) => b.itemIds)
      .find((i) => !used.has(i))!
    used.add(id)
    attempts[id] = [{ round: 1, answer: 'x', confidence: 3, score: 0, errorCode, fix } as Attempt]
  }
  actions.importJson(JSON.stringify({ app: 'cognitive-gym', state: { attempts, blocks: stateBlocks } }))
}

function Panel({ week = W }: { week?: number }) {
  return <WeekEndPanel s={useStore()} week={week} />
}

/** The required "Strategy change for next week" field (the last Reflection question). */
const strategyField = () => {
  const qs = reflectionQuestions(W)
  return screen.getByRole('textbox', { name: `${qs.length}. ${qs[qs.length - 1]}` })
}

const times = (n: number, m: Miss): Miss[] => Array.from({ length: n }, () => m)

describe('week-end Top Focus card', () => {
  beforeEach(() => {
    localStorage.clear()
    actions.reset()
  })
  afterEach(cleanup)

  it('shows only the top Focus, with a link to see all on the Error log', () => {
    seed([...times(4, ['R']), ...times(3, ['K'])])
    render(<Panel />)
    const card = within(screen.getByRole('region', { name: 'Top Focus' }))
    expect(card.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['R · Representation error'])
    expect(card.getByRole('link', { name: 'see all on Error log' })).toHaveAttribute('href', '#/errors')
  })

  it('shows at most one call-out line: a Fix not working wins over a repeated dominant error', () => {
    seed([['H', 'Write two rival hypotheses', 1], ['H', undefined, 2], ['H', undefined, 3]])
    render(<Panel week={3} />)
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      "Your Fix for H didn't stop it. Rewrite the strategy, don't repeat it.",
    ])
  })

  it('prompts with the top Focus under the strategy field, and never pre-fills it', () => {
    seed(times(4, ['R']))
    render(<Panel />)
    expect(strategyField()).toHaveValue('')
    expect(strategyField()).toHaveAccessibleDescription('Your top Focus is R · Representation error. What will you change?')
  })

  it('nothing ranks: hides the card and uses a generic strategy prompt', () => {
    seed(times(2, ['R']))
    render(<Panel />)
    expect(screen.queryByRole('region', { name: 'Top Focus' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(strategyField()).toHaveAccessibleDescription('What will you change next week?')
  })

  it.each([
    ['with a top Focus', times(4, ['R'])],
    ['with nothing ranked', []],
  ] as [string, Miss[]][])('the week-end completes on the strategy sentence alone, %s', async (_, misses) => {
    seed(misses)
    render(<Panel />)
    expect(weekEnd(getState(), W).complete).toBe(false)
    await userEvent.type(strategyField(), 'Draw the structure before answering')
    expect(weekEnd(getState(), W).complete).toBe(true)
  })
})
