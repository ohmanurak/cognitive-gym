// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCoachClient } from '../lib/coachClient'
import type { Attempt, CoachingNote, ErrorCode } from '../lib/state'
import { actions, getState } from '../lib/store'
import { Errors } from './Errors'

type Miss = [id: string, score: number, code: ErrorCode, extra?: Partial<Attempt>]
/** Ranked: K (3), R (3), S (3), C (3, 4th so outside the top 3). Provisional: H (1). */
const MISSES: Miss[] = [
  ['B3-03', 0, 'K'], ['B3-05', 0, 'K', { fix: 'Old fix.' }], ['B4-03', 0, 'K'],
  ['B4-01', 3, 'R'], ['B4-02', 3, 'R'], ['B4-05', 2, 'R'],
  ['B2-03', 0, 'S'], ['B5-07', 0, 'S'], ['B5-11', 0, 'S'],
  ['B1-01', 0, 'C'], ['B1-02', 0, 'C'], ['B1-03', 0, 'C'],
  ['B3-01', 2, 'H'],
]
function seed() {
  const attempts = Object.fromEntries(
    MISSES.map(([id, score, errorCode, extra]) => [id, [{ round: 1, answer: 'x', confidence: 3, score, errorCode, ...extra }]]),
  )
  actions.importJson(JSON.stringify({ app: 'cognitive-gym', state: { attempts } }))
}

const note = (diagnosis: string, basedOn: string[], strategies = ['Write the definition before you answer.']): CoachingNote => ({
  createdAt: '2026-10-02T10:00:00.000Z',
  model: 'claude-sonnet-5-5',
  basedOn: basedOn.map((id) => ({ id, week: 0 })),
  sections: { diagnosis, strategies, practice: ['Redo it.'], searchTopic: 'topic' },
  links: [],
  usage: { inputTokens: 1000, outputTokens: 300, searches: 0, costUsd: 0.005 },
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** fetch stub: health ok; any diagnose call answers with `reply`. */
function stubFetch(reply: () => Response) {
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    if (url.endsWith('/api/coach/health')) return Promise.resolve(json(200, { ok: true, remainingUsd: 5, capUsd: 5 }))
    if (/\/api\/coach\/diagnose/.test(url)) return Promise.resolve(reply())
    return Promise.reject(new TypeError('unexpected ' + url))
  })
  vi.stubGlobal('fetch', fetchMock)
  const calls = (route: string) => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(route))
  return { calls }
}

const section = () => screen.getByRole('region', { name: 'What to work on' })
const row = (id: string) => screen.getByRole('group', { name: `Miss ${id}` })

describe('Error log: Coach this miss, Use as Fix, stale and Regenerate', () => {
  beforeEach(() => {
    localStorage.clear()
    actions.reset()
    resetCoachClient()
    seed()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('"Coach this miss" sends that one miss and shows its note inline on the row', async () => {
    const MISS_NOTE = note('Your Answer left the derivation at step 2. You fell into the trap.', ['B2-03'])
    const { calls } = stubFetch(() => json(200, { note: MISS_NOTE, remainingUsd: 4.99 }))
    render(<Errors />)
    await userEvent.click(await within(row('B2-03')).findByRole('button', { name: 'Coach this miss · ~$0.01' }))
    await waitFor(() => expect(getState().coachingNotes['miss:B2-03']).toEqual(MISS_NOTE))

    expect(calls('/api/coach/diagnose-miss')).toHaveLength(1)
    const sent = JSON.parse(String(calls('/api/coach/diagnose-miss')[0][1]?.body))
    expect(sent.key).toBe('miss:B2-03')
    expect(sent.basedOn).toEqual([{ id: 'B2-03', week: 0 }])
    expect(sent.payload.miss).toMatchObject({ id: 'B2-03', answer: 'x', key: { trap: expect.stringContaining('a = 13') } })
    expect(sent.payload.code).toMatchObject({ code: 'S' })

    expect(within(row('B2-03')).getByText(/· Your Answer left the derivation at step 2\./)).toBeInTheDocument()
    expect(within(row('B2-03')).queryByRole('button', { name: /Coach this miss/ })).not.toBeInTheDocument()
    expect(within(row('B5-07')).queryByText(/Your Answer left the derivation/)).not.toBeInTheDocument()
  })

  it('Use as Fix: copies the (editable) strategy only to the checked misses; an existing Fix is not preselected', async () => {
    stubFetch(() => json(500, {}))
    actions.setCoachingNote('focus:K', note('You read "confounder" as any third variable.', ['B3-03', 'B3-05', 'B4-03']))
    render(<Errors />)
    await userEvent.click(within(section()).getByText(/· You read "confounder"/))
    await userEvent.click(within(section()).getByRole('button', { name: 'Use as Fix' }))

    const list = within(section()).getByRole('group', { name: 'Use as Fix' })
    expect(within(list).getByRole('checkbox', { name: /B3-03/ })).toBeChecked()
    expect(within(list).getByRole('checkbox', { name: /B4-03/ })).toBeChecked()
    const kept = within(list).getByRole('checkbox', { name: /B3-05/ })
    expect(kept).not.toBeChecked()
    expect(within(list).getByText(/Old fix\./)).toBeInTheDocument()

    await userEvent.click(within(list).getByRole('checkbox', { name: /B4-03/ }))
    const text = within(list).getByRole('textbox', { name: 'Fix text' })
    expect(text).toHaveValue('Write the definition before you answer.')
    await userEvent.type(text, ' Then test it on the example.')
    await userEvent.click(within(list).getByRole('button', { name: 'Copy to 1 miss' }))

    const fix = (id: string) => getState().attempts[id][0].fix
    expect(fix('B3-03')).toBe('Write the definition before you answer. Then test it on the example.')
    expect(fix('B3-05')).toBe('Old fix.')
    expect(fix('B4-03')).toBeUndefined()
    expect(within(row('B3-03')).getByText(/Then test it on the example\./)).toBeInTheDocument()
  })

  it('Use as Fix on a per-miss note offers just that miss', async () => {
    stubFetch(() => json(500, {}))
    actions.setCoachingNote('miss:B2-03', note('You dropped b.', ['B2-03'], ['Write each intermediate value down.']))
    render(<Errors />)
    await userEvent.click(within(row('B2-03')).getByText(/· You dropped b\./))
    await userEvent.click(within(row('B2-03')).getByRole('button', { name: 'Use as Fix' }))
    const list = within(row('B2-03')).getByRole('group', { name: 'Use as Fix' })
    expect(within(list).getAllByRole('checkbox')).toHaveLength(1)
    await userEvent.click(within(list).getByRole('button', { name: 'Copy to 1 miss' }))
    expect(getState().attempts['B2-03'][0].fix).toBe('Write each intermediate value down.')
  })

  it('a stale Focus note shows "N new misses since this note"; Regenerate confirms date and cost, then replaces it', async () => {
    const NEW = note('Fresh diagnosis across all three.', ['B3-03', 'B3-05', 'B4-03'])
    const { calls } = stubFetch(() => json(200, { note: NEW, remainingUsd: 4.98 }))
    actions.setCoachingNote('focus:K', note('Old diagnosis.', ['B4-03']))
    actions.setCoachingNote('miss:B2-03', note('Per-miss.', ['B2-03']))
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    render(<Errors />)

    expect(within(section()).getByText('2 new misses since this note')).toBeInTheDocument()
    expect(within(row('B2-03')).queryByText(/new miss/)).not.toBeInTheDocument()
    const regen = await within(section()).findByRole('button', { name: 'Regenerate' })
    expect(calls('/api/coach/diagnose')).toHaveLength(0)

    await userEvent.click(regen)
    expect(confirm).toHaveBeenCalledWith('Replace note from 2 Oct? ~$0.01')
    expect(calls('/api/coach/diagnose')).toHaveLength(0)
    expect(getState().coachingNotes['focus:K'].sections.diagnosis).toBe('Old diagnosis.')

    confirm.mockReturnValue(true)
    await userEvent.click(regen)
    await waitFor(() => expect(getState().coachingNotes['focus:K']).toEqual(NEW))
    expect(calls('/api/coach/diagnose')).toHaveLength(1)
    expect(within(section()).getByText(/· Fresh diagnosis across all three\./)).toBeInTheDocument()
    expect(within(section()).queryByText(/new misses since this note/)).not.toBeInTheDocument()
  })

  it('notes on a Focus outside the top 3 and on a Provisional one stay reachable from the collapsed line', async () => {
    stubFetch(() => json(500, {}))
    actions.setCoachingNote('focus:C', note('C note: you slip on carries.', ['B1-01', 'B1-02', 'B1-03']))
    actions.setCoachingNote('focus:H', note('H note: you stop at the first idea.', ['B3-01']))
    render(<Errors />)
    await act(async () => {})
    const cards = within(section()).getAllByRole('button', { name: /^(K|R|S|C|H) · / })
    expect(cards.map((c) => c.getAttribute('aria-label')?.split(' · ')[0])).toEqual(['K', 'R', 'S'])

    const line = within(section()).getByText(/Provisional: H/)
    expect(within(section()).getByText(/· C note: you slip on carries\./)).not.toBeVisible()
    await userEvent.click(line)
    expect(within(section()).getByText(/· C note: you slip on carries\./)).toBeVisible()
    expect(within(section()).getByText(/· H note: you stop at the first idea\./)).toBeVisible()
  })
})
