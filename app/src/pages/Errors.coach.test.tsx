// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCoachClient } from '../lib/coachClient'
import type { CoachingNote, ErrorCode } from '../lib/state'
import { actions, getState } from '../lib/store'
import { Errors } from './Errors'

type Miss = [id: string, score: number, code: ErrorCode]
/** K ranks (3 misses); H is Provisional (1 miss). */
const MISSES: Miss[] = [
  ['B3-03', 0, 'K'], ['B3-05', 0, 'K'], ['B4-03', 0, 'K'],
  ['B3-01', 2, 'H'],
]
function seed() {
  const attempts = Object.fromEntries(
    MISSES.map(([id, score, errorCode]) => [id, [{ round: 1, answer: 'x', confidence: 3, score, errorCode }]]),
  )
  actions.importJson(JSON.stringify({ app: 'cognitive-gym', state: { attempts } }))
}

const NOTE: CoachingNote = {
  createdAt: '2026-10-02T10:00:00.000Z',
  model: 'claude-sonnet-5-5',
  basedOn: [{ id: 'B4-03', week: 0 }],
  sections: {
    diagnosis: 'You read "confounder" as any third variable.\nIn B3-03 you assumed X.',
    strategies: ['Write the definition before you answer.'],
    practice: ['Redo B3-03 from the definition.'],
    studyTopics: ['confounding variable'],
  },
  usage: { inputTokens: 2129, outputTokens: 802, costUsd: 0.0123 },
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** fetch stub: a fixed health answer, and a diagnose answer the test releases when it wants. */
function stubFetch(health: unknown, healthStatus = 200) {
  let resolveDiagnose: (r: Response) => void = () => {}
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    if (url.endsWith('/api/coach/health')) return Promise.resolve(json(healthStatus, health))
    if (url.endsWith('/api/coach/diagnose')) return new Promise<Response>((r) => (resolveDiagnose = r))
    return Promise.reject(new TypeError('unexpected ' + url))
  })
  vi.stubGlobal('fetch', fetchMock)
  const diagnoseCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/diagnose'))
  return { fetchMock, diagnoseCalls, finishDiagnose: (r: Response) => act(async () => resolveDiagnose(r)) }
}

const section = () => screen.getByRole('region', { name: 'What to work on' })
const coachButtons = () => within(section()).findAllByRole('button', { name: 'Coach me · ~$0.01' })

describe('Error log: Coach me', () => {
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

  it('hides all Coach UI when the health check is not ok', async () => {
    const { fetchMock } = stubFetch({ ok: false, remainingUsd: 5, capUsd: 5 })
    render(<Errors />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('button', { name: /Coach me/ })).not.toBeInTheDocument()
  })

  it('hides all Coach UI on the static build (no /api/coach)', async () => {
    const { fetchMock } = stubFetch('<!doctype html>', 404)
    render(<Errors />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('button', { name: /Coach me/ })).not.toBeInTheDocument()
  })

  it('shows Coach me on each Focus card, including Provisional ones', async () => {
    stubFetch({ ok: true, remainingUsd: 5, capUsd: 5 })
    render(<Errors />)
    expect(await coachButtons()).toHaveLength(2)
  })

  it('over the cap: disabled with the budget message', async () => {
    stubFetch({ ok: true, remainingUsd: 0, capUsd: 5 })
    render(<Errors />)
    const [btn] = await coachButtons()
    expect(btn).toBeDisabled()
    expect(within(section()).getAllByText('Monthly coaching budget ($5) used').length).toBeGreaterThan(0)
  })

  it('running: spinner label, the same note cannot start twice, then the note saves and shows collapsed', async () => {
    const { diagnoseCalls, finishDiagnose } = stubFetch({ ok: true, remainingUsd: 5, capUsd: 5 })
    render(<Errors />)
    const [btn] = await coachButtons()
    await userEvent.click(btn)
    expect(within(section()).getByText('Diagnosing… ~15 s')).toBeInTheDocument()
    await userEvent.click(btn)
    expect(diagnoseCalls()).toHaveLength(1)
    const sent = JSON.parse(String(diagnoseCalls()[0][1]?.body))
    expect(sent.key).toBe('focus:K')
    expect(sent.payload.misses.map((m: { id: string }) => m.id).sort()).toEqual(['B3-03', 'B3-05', 'B4-03'])

    await finishDiagnose(json(200, { note: NOTE, remainingUsd: 4.98 }))
    expect(getState().coachingNotes['focus:K']).toEqual(NOTE)
    expect(within(section()).queryByText('Diagnosing… ~15 s')).not.toBeInTheDocument()
    const summary = within(section()).getByText(/· You read "confounder" as any third variable\./)
    expect(summary).toHaveTextContent('2 Oct')
    expect(summary).not.toHaveTextContent('In B3-03 you assumed X.')
    expect(within(section()).getByText('Write the definition before you answer.')).not.toBeVisible()
  })

  it('a failure shows its message inline and saves nothing', async () => {
    const { finishDiagnose } = stubFetch({ ok: true, remainingUsd: 5, capUsd: 5 })
    render(<Errors />)
    const [btn] = await coachButtons()
    await userEvent.click(btn)
    await finishDiagnose(json(429, { error: 'Rate limited, try again in 30 s' }))
    expect(within(section()).getByText('Rate limited, try again in 30 s')).toBeInTheDocument()
    expect(getState().coachingNotes['focus:K']).toBeUndefined()
  })

  it('expanded, the note shows Diagnosis, Strategy, Practice, Study topics and its cost', async () => {
    stubFetch({ ok: true, remainingUsd: 5, capUsd: 5 })
    actions.setCoachingNote('focus:K', NOTE)
    render(<Errors />)
    await userEvent.click(within(section()).getByText(/· You read "confounder"/))
    for (const h of ['Diagnosis', 'Strategy', 'Practice', 'Study topics']) expect(within(section()).getByText(h)).toBeVisible()
    expect(within(section()).getByText('confounding variable')).toBeVisible()
    expect(within(section()).queryByRole('button', { name: /Find study links/ })).not.toBeInTheDocument()
    expect(within(section()).getByText(/In B3-03 you assumed X\./)).toBeVisible()
    expect(within(section()).getByText('Write the definition before you answer.')).toBeVisible()
    expect(within(section()).getByText('Redo B3-03 from the definition.')).toBeVisible()
    expect(within(section()).getByText(/\$0\.012/)).toBeVisible()
  })
})
