// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCoachClient } from '../lib/coachClient'
import type { CoachingNote } from '../lib/state'
import { actions, getState } from '../lib/store'
import { Errors } from './Errors'

function seed() {
  const attempts = Object.fromEntries(
    ['B3-03', 'B3-05', 'B4-03'].map((id) => [id, [{ round: 1, answer: 'x', confidence: 3, score: 0, errorCode: 'K' }]]),
  )
  actions.importJson(JSON.stringify({ app: 'cognitive-gym', state: { attempts } }))
}

const NOTE: CoachingNote = {
  createdAt: '2026-10-02T10:00:00.000Z',
  model: 'claude-sonnet-5-5',
  basedOn: [{ id: 'B4-03', week: 0 }],
  sections: {
    diagnosis: 'You read "confounder" as any third variable.',
    strategies: ['Write the definition before you answer.'],
    practice: ['Redo B3-03 from the definition.'],
    searchTopic: 'confounding variable',
  },
  links: [],
  usage: { inputTokens: 2129, outputTokens: 802, searches: 0, costUsd: 0.012 },
}

const LINKS = [
  { url: 'https://www.youtube.com/watch?v=abc123', title: 'Confounding, explained', source: 'youtube', reason: 'A worked example in 8 minutes.', verified: true },
  { url: 'https://betterexplained.com/articles/confounding/', title: 'Confounding variables', source: 'blog', reason: 'Defines it with a table.', verified: true },
]
const LINK_USAGE = { inputTokens: 49975, outputTokens: 1334, searches: 5, costUsd: 0.163 }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function stubFetch() {
  let resolveLinks: (r: Response) => void = () => {}
  const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
    if (url.endsWith('/api/coach/health')) return Promise.resolve(json(200, { ok: true, remainingUsd: 5, capUsd: 5 }))
    if (url.endsWith('/api/coach/links')) return new Promise<Response>((r) => (resolveLinks = r))
    return Promise.reject(new TypeError('unexpected ' + url))
  })
  vi.stubGlobal('fetch', fetchMock)
  const linkCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/links'))
  return { linkCalls, finishLinks: (r: Response) => act(async () => resolveLinks(r)) }
}

const section = () => screen.getByRole('region', { name: 'What to work on' })
async function openNote() {
  await userEvent.click(within(section()).getByText(/· You read "confounder"/))
  return within(section()).findByRole('button', { name: 'Find study links · ~$0.16' })
}

describe('Error log: Find study links', () => {
  beforeEach(() => {
    localStorage.clear()
    actions.reset()
    resetCoachClient()
    seed()
    actions.setCoachingNote('focus:K', NOTE)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('searches with the note topic, shows the spinner, then shows the links and the updated cost', async () => {
    const { linkCalls, finishLinks } = stubFetch()
    render(<Errors />)
    const btn = await openNote()
    await userEvent.click(btn)
    expect(within(section()).getByText('Searching YouTube and blogs… ~15 s')).toBeInTheDocument()
    await userEvent.click(btn)
    expect(linkCalls()).toHaveLength(1)
    expect(JSON.parse(String(linkCalls()[0][1]?.body))).toMatchObject({ searchTopic: 'confounding variable' })

    await finishLinks(json(200, { links: LINKS, usage: LINK_USAGE, remainingUsd: 4.8 }))
    expect(within(section()).queryByText('Searching YouTube and blogs… ~15 s')).not.toBeInTheDocument()
    const video = within(section()).getByRole('link', { name: 'Confounding, explained' })
    expect(video).toHaveAttribute('href', LINKS[0].url)
    const videoItem = video.closest('li') as HTMLElement
    expect(within(videoItem).getByText('YouTube')).toBeVisible()
    expect(within(videoItem).getByText(/A worked example in 8 minutes\./)).toBeVisible()
    const blogItem = within(section()).getByRole('link', { name: 'Confounding variables' }).closest('li') as HTMLElement
    expect(within(blogItem).getByText('Blog')).toBeVisible()
    expect(within(blogItem).getByText(/Defines it with a table\./)).toBeVisible()
    expect(within(section()).getByText(/\$0\.175/)).toBeVisible()
    expect(within(section()).queryByRole('button', { name: /Find study links/ })).not.toBeInTheDocument()

    const saved = getState().coachingNotes['focus:K']
    expect(saved.links).toEqual(LINKS)
    expect(saved.sections).toEqual(NOTE.sections)
    expect(saved.usage).toEqual({ inputTokens: 2129 + 49975, outputTokens: 802 + 1334, searches: 5, costUsd: 0.012 + 0.163 })
  })

  it('unverified search fallbacks are marked "search, not verified"', async () => {
    const { finishLinks } = stubFetch()
    render(<Errors />)
    await userEvent.click(await openNote())
    const fallback = [{ url: 'https://www.youtube.com/results?search_query=confounding', title: 'YouTube search: confounding', source: 'youtube', reason: 'search, not verified', verified: false }]
    await finishLinks(json(200, { links: fallback, usage: LINK_USAGE, remainingUsd: 4.8 }))
    const item = within(section()).getByRole('link', { name: 'YouTube search: confounding' }).closest('li') as HTMLElement
    expect(within(item).getByText(/search, not verified/)).toBeVisible()
  })

  it('a failure shows its message inline and leaves the saved diagnosis untouched', async () => {
    const { finishLinks } = stubFetch()
    render(<Errors />)
    await userEvent.click(await openNote())
    await finishLinks(json(502, { error: "Couldn't reach Claude" }))
    expect(within(section()).getByText("Couldn't reach Claude")).toBeInTheDocument()
    expect(getState().coachingNotes['focus:K']).toEqual(NOTE)
    expect(within(section()).getByRole('button', { name: 'Find study links · ~$0.16' })).toBeEnabled()
  })
})
