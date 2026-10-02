// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ErrorCode } from '../lib/state'
import { actions } from '../lib/store'
import { Errors } from './Errors'

type Miss = [id: string, score: number, code?: ErrorCode]

/** Baseline misses: K (3), R (3), S (3), H (1), WM (1). */
const BASELINE: Miss[] = [
  ['B3-03', 0, 'K'], ['B3-05', 0, 'K'], ['B4-03', 0, 'K'],
  ['B4-01', 3, 'R'], ['B4-02', 3, 'R'], ['B4-05', 2, 'R'],
  ['B2-03', 0, 'S'], ['B5-07', 0, 'S'], ['B5-11', 0, 'S'],
  ['B3-01', 2, 'H'], ['B3-04', 2, 'WM'],
]

function seed(misses: Miss[]) {
  const attempts = Object.fromEntries(
    misses.map(([id, score, errorCode]) => [id, [{ round: 1, answer: 'x', confidence: 3, score, errorCode }]]),
  )
  actions.importJson(JSON.stringify({ app: 'cognitive-gym', state: { attempts } }))
}

const section = () => screen.getByRole('region', { name: 'What to work on' })
const listedItems = () => [...document.querySelectorAll('.item-id')].map((a) => a.textContent).sort()

describe('Error log: What to work on', () => {
  beforeEach(() => {
    localStorage.clear()
    actions.reset()
  })
  afterEach(cleanup)

  it('shows the top 3 Focus cards in rank order and Provisional groups on one collapsed line', () => {
    seed(BASELINE)
    render(<Errors />)
    const cards = within(section()).getAllByRole('button', { name: /^(K|R|S|H|WM) · / })
    expect(cards.map((c) => c.getAttribute('aria-label')?.split(' · ')[0])).toEqual(['K', 'R', 'S'])
    expect(within(section()).getByText(/Provisional: H, WM/)).toBeInTheDocument()
  })

  it('clicking a Focus card filters the miss list to that code', async () => {
    seed(BASELINE)
    render(<Errors />)
    expect(listedItems()).toHaveLength(11)
    await userEvent.click(within(section()).getByRole('button', { name: /^R · / }))
    expect(listedItems()).toEqual(['B4-01', 'B4-02', 'B4-05'])
  })

  it('with no coded misses, says so', () => {
    render(<Errors />)
    expect(within(section()).getByText(/No coded misses yet/)).toBeInTheDocument()
  })

  it('with only Provisional groups, says they need 3+ misses to rank', () => {
    seed([['B3-01', 2, 'H'], ['B3-04', 2, 'WM']])
    render(<Errors />)
    expect(within(section()).queryAllByRole('button')).toHaveLength(0)
    expect(within(section()).getByText(/Nothing ranks yet: each code needs 3\+ misses to rank/)).toBeInTheDocument()
  })

  it('hints how many misses are still uncoded', () => {
    seed([...BASELINE, ['W1D1-B2', 1], ['W1D1-C2', 0]])
    render(<Errors />)
    expect(within(section()).getByText('2 misses still uncoded')).toBeInTheDocument()
  })
})
