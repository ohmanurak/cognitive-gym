import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSpendStore, type CoachClient } from './coach.ts'
import { BLOG_DOMAINS, handleLinks, type Fetcher, type LinksDeps } from './links.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cogym-links-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const NOW = new Date('2026-10-02T10:00:00.000Z')
type Params = Anthropic.MessageCreateParamsNonStreaming
const fakeClient = (create: (p: Params) => Promise<Anthropic.Message>): CoachClient => ({ messages: { create } })
/** Every page is live and free. */
const liveFetcher: Fetcher = async () => ({ status: 200, ok: true, text: async () => '' })
const deps = (p: Partial<LinksDeps> = {}): LinksDeps => ({
  client: fakeClient(async () => {
    throw new Error('not expected')
  }),
  spend: createSpendStore(dir),
  now: () => NOW,
  capUsd: 5,
  log: () => {},
  fetcher: liveFetcher,
  ...p,
})

const YT = 'https://www.youtube.com/watch?v=abc123'
const BLOG = 'https://betterexplained.com/articles/confounding/'
const USAGE = { input_tokens: 20000, output_tokens: 600, server_tool_use: { web_search_requests: 3 } }
const CALL_COST = 20000 * 2e-6 + 600 * 10e-6 + 3 * 0.01

/** A recorded-shape link reply returning `url` from search and naming it in the text. */
const linkReply = (url: string, title: string, p: Partial<Anthropic.Message> = {}): Anthropic.Message =>
  ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [
      { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'q' } },
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url, title, page_age: null, encrypted_content: 'e' }] },
      { type: 'text', text: `${title} | ${url} | Explains it with an example.`, citations: null },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: USAGE,
    ...p,
  }) as unknown as Anthropic.Message

const isYouTube = (p: Params) => JSON.stringify(p.tools).includes('"youtube.com"')
const BODY = { key: 'focus:K', searchTopic: 'confounding variable explained' }
const links = (d: LinksDeps, body: unknown = BODY) => handleLinks({ method: 'POST', path: '/links', body }, d)

describe('POST /links', () => {
  it('runs the YouTube and blog-allow-list searches in parallel and returns verified links with the cost', async () => {
    const calls: Params[] = []
    let release = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const d = deps({
      client: fakeClient(async (p) => {
        calls.push(p)
        if (calls.length === 2) release()
        await gate
        return isYouTube(p) ? linkReply(YT, 'Confounding, explained') : linkReply(BLOG, 'Confounding variables')
      }),
    })
    const r = await links(d)
    expect(calls).toHaveLength(2)
    for (const p of calls) {
      expect(p).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 2000, output_config: { effort: 'low' } })
      expect(p.tools).toHaveLength(1)
      expect(p.tools?.[0]).toMatchObject({ type: 'web_search_20260318', name: 'web_search', max_uses: 3, response_inclusion: 'full' })
      expect(JSON.stringify(p.messages)).toContain('confounding variable explained')
    }
    const domains = calls.map((p) => (p.tools?.[0] as Anthropic.WebSearchTool20260318 | undefined)?.allowed_domains)
    expect(domains).toContainEqual(['youtube.com'])
    expect(domains).toContainEqual(BLOG_DOMAINS)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({
      links: [
        { url: YT, title: 'Confounding, explained', source: 'youtube', reason: 'Explains it with an example.', verified: true },
        { url: BLOG, title: 'Confounding variables', source: 'blog', reason: 'Explains it with an example.', verified: true },
      ],
      usage: { inputTokens: 40000, outputTokens: 1200, searches: 6, costUsd: 2 * CALL_COST },
      remainingUsd: 5 - 2 * CALL_COST,
    })
    expect(d.spend.spent('2026-10')).toBeCloseTo(2 * CALL_COST)
  })

  it('continues pause_turn at most twice, resending the paused turn, and counts every response', async () => {
    const yt: Params[] = []
    const d = deps({
      client: fakeClient(async (p) => {
        if (!isYouTube(p)) return linkReply(BLOG, 'Blog')
        yt.push(p)
        return linkReply(YT, 'Video', { stop_reason: 'pause_turn' })
      }),
    })
    const r = await links(d)
    expect(yt).toHaveLength(3)
    expect(yt[0].messages).toHaveLength(1)
    expect(yt[1].messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(JSON.stringify(yt[1].messages[1].content)).toContain('web_search_tool_result')
    expect(yt[2].messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(r.body).toMatchObject({ usage: { searches: 12, costUsd: 4 * CALL_COST } })
    expect((r.body as { links: { url: string }[] }).links.map((l) => l.url)).toEqual([YT, BLOG])
  })

  it('stops continuing once a continuation ends the turn', async () => {
    let n = 0
    const d = deps({
      client: fakeClient(async (p) => {
        if (!isYouTube(p)) return linkReply(BLOG, 'Blog')
        return linkReply(YT, 'Video', { stop_reason: ++n === 1 ? 'pause_turn' : 'end_turn' })
      }),
    })
    await links(d)
    expect(n).toBe(2)
  })

  it('over the spend cap: no calls, the budget message', async () => {
    let called = 0
    const d = deps({
      client: fakeClient(async () => {
        called++
        return linkReply(YT, 'Video')
      }),
    })
    d.spend.add('2026-10', 5)
    expect(await links(d)).toEqual({ status: 402, body: { error: 'Monthly coaching budget ($5) used', remainingUsd: 0 } })
    expect(called).toBe(0)
  })

  it('zero verified links: saves YouTube and Google search URLs marked "search, not verified", cost still counts', async () => {
    const dead: Fetcher = async () => ({ status: 404, ok: false, text: async () => '' })
    const d = deps({ client: fakeClient(async (p) => (isYouTube(p) ? linkReply(YT, 'Video') : linkReply(BLOG, 'Blog'))), fetcher: dead })
    const r = await links(d)
    expect(r.status).toBe(200)
    const found = (r.body as { links: { url: string; verified: boolean; reason: string }[] }).links
    expect(found.length).toBeGreaterThanOrEqual(2)
    expect(found.length).toBeLessThanOrEqual(3)
    expect(found.every((l) => !l.verified && l.reason === 'search, not verified')).toBe(true)
    const hosts = found.map((l) => new URL(l.url).hostname)
    expect(hosts).toContain('www.youtube.com')
    expect(hosts).toContain('www.google.com')
    expect(found.every((l) => new URL(l.url).search.includes('confounding'))).toBe(true)
    expect(d.spend.spent('2026-10')).toBeCloseTo(2 * CALL_COST)
  })

  it('both calls fail: the mapped error only, no links and nothing billed', async () => {
    const err = Anthropic.APIError.generate(401, { type: 'error', error: { type: 'authentication_error', message: 'x' } }, undefined, new Headers())
    const d = deps({ client: fakeClient(async () => Promise.reject(err)) })
    expect(await links(d)).toEqual({ status: 401, body: { error: 'API key missing or invalid. Set ANTHROPIC_API_KEY in app/.env.local' } })
    expect(d.spend.spent('2026-10')).toBe(0)
  })

  it('one call fails: that source counts as zero links, the other still returns', async () => {
    const d = deps({
      client: fakeClient(async (p) => {
        if (isYouTube(p)) throw new Anthropic.APIConnectionError({ message: 'fetch failed' })
        return linkReply(BLOG, 'Blog')
      }),
    })
    const r = await links(d)
    expect(r.status).toBe(200)
    expect((r.body as { links: { url: string }[] }).links.map((l) => l.url)).toEqual([BLOG])
  })

  it('refuses a missing searchTopic and a missing key without calling Claude', async () => {
    expect((await links(deps(), { key: 'focus:K' })).status).toBe(400)
    expect(await links(deps({ client: null }))).toEqual({
      status: 401,
      body: { error: 'API key missing or invalid. Set ANTHROPIC_API_KEY in app/.env.local' },
    })
  })
})
