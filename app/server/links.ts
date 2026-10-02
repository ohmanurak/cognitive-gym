/**
 * Find study links (#55), server side: the `POST /api/coach/links` handler, the reply parser and
 * the link verifier. The Anthropic client and the HTTP fetcher are injected, so tests never touch
 * the network.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { COACH_MODEL, NO_KEY, costOf, mapError, month, type CoachDeps, type CoachRequest, type CoachResponse } from './coach.ts'

export type LinkSource = 'youtube' | 'blog'

export interface StudyLink {
  url: string
  title: string
  source: LinkSource
  reason: string
  verified: boolean
}

/** A link Claude proposed that the search really returned, before the liveness check. */
export type Candidate = Omit<StudyLink, 'verified'>

const URL_RE = /https?:\/\/[^\s<>"'`|)\]]+/g
const stripTrailing = (u: string) => u.replace(/[.,;:!?'"*_)\]}]+$/, '')
const clean = (s: string) =>
  s
    .replace(/\*\*|__/g, '')
    .replace(/^[\s\-*–—:•\d.]+/, '')
    .replace(/[\s\-–—:]+$/, '')
    .trim()

/**
 * URLs from the reply text, kept only when they match a `web_search_result.url` (citations are
 * empty under dynamic filtering, spike #46). An error inside any search result block means zero
 * links for this source.
 */
export function parseLinks(content: Anthropic.ContentBlock[], source: LinkSource): Candidate[] {
  const results = new Map<string, string>()
  for (const b of content) {
    if (b.type !== 'web_search_tool_result') continue
    if (!Array.isArray(b.content)) return []
    for (const r of b.content) results.set(r.url, r.title)
  }
  const text = content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  const out: Candidate[] = []
  for (const line of text.split('\n')) {
    for (const raw of line.match(URL_RE) ?? []) {
      const url = stripTrailing(raw)
      const title = results.get(url)
      if (title === undefined || out.some((c) => c.url === url)) continue
      const segs = line.split('|')
      const at = segs.findIndex((s) => s.includes(raw))
      const after = clean(segs.slice(at + 1).join('|'))
      const reason = after || clean(line.replace(raw, '').replace(/\[[^\]]*\]\(\s*\)/g, ''))
      out.push({ url, title, source, reason })
    }
  }
  return out
}

/** The slice of `fetch` the verifier needs; injected so tests never touch the network. */
export type Fetcher = (
  url: string,
  init?: { method?: 'GET' | 'HEAD'; headers?: Record<string, string> },
) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>

/** The real fetcher: global fetch, redirects followed, 8 s per request. */
export const createLinkFetcher = (timeoutMs = 8000): Fetcher => (url, init) =>
  fetch(url, { ...init, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })

export const MAX_PER_SOURCE = 3

const PAYWALLED = /"isAccessibleForFree"\s*:\s*"?false"?/i

const attempt = async <T>(f: () => Promise<T>): Promise<T | null> => {
  try {
    return await f()
  } catch {
    return null
  }
}

/** YouTube: oEmbed answers 200 for a live video (400/404 otherwise). */
async function youtubeLive(url: string, fetcher: Fetcher): Promise<boolean> {
  const r = await attempt(() => fetcher(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`))
  return r?.status === 200
}

/** Others: HEAD for liveness, GET when HEAD fails; the first bytes of the page are read for a paywall mark. */
async function pageFree(url: string, fetcher: Fetcher): Promise<boolean> {
  const head = await attempt(() => fetcher(url, { method: 'HEAD' }))
  const get = await attempt(() => fetcher(url, { method: 'GET', headers: { Range: 'bytes=0-262143' } }))
  if (!head?.ok && !get?.ok) return false
  const body = get?.ok ? ((await attempt(() => get.text())) ?? '') : ''
  return !PAYWALLED.test(body)
}

/** Checks every candidate in parallel; keeps the first {@link MAX_PER_SOURCE} live ones per source, in reply order. */
export async function verifyLinks(candidates: Candidate[], fetcher: Fetcher): Promise<StudyLink[]> {
  const live = await Promise.all(
    candidates.map((c) => (c.source === 'youtube' ? youtubeLive(c.url, fetcher) : pageFree(c.url, fetcher))),
  )
  const kept: StudyLink[] = []
  candidates.forEach((c, i) => {
    if (live[i] && kept.filter((k) => k.source === c.source).length < MAX_PER_SOURCE) kept.push({ ...c, verified: true })
  })
  return kept
}

/** Curated blog allow-list from the spike (#46). */
export const BLOG_DOMAINS = [
  'khanacademy.org',
  'betterexplained.com',
  'statisticsbyjim.com',
  'brilliant.org',
  'lesswrong.com',
  'scribbr.com',
  'mathsisfun.com',
  'towardsdatascience.com',
]

const SOURCES: { source: LinkSource; domains: string[]; what: string }[] = [
  { source: 'youtube', domains: ['youtube.com'], what: 'YouTube videos' },
  { source: 'blog', domains: BLOG_DOMAINS, what: 'articles or blog posts' },
]

/** Continuations allowed after a `pause_turn` (#49). */
export const MAX_CONTINUATIONS = 2

export interface LinksDeps extends CoachDeps {
  fetcher: Fetcher
}

export interface LinksUsage {
  inputTokens: number
  outputTokens: number
  searches: number
  costUsd: number
}

const prompt = (what: string, topic: string) =>
  [
    `Find 2-3 free, beginner-friendly ${what} that teach: ${topic}`,
    'Only pick pages your search returned. One line per pick, exactly: title | URL | one-line reason it helps.',
  ].join('\n')

/** One source's search call, with `pause_turn` continued at most {@link MAX_CONTINUATIONS} times. */
async function searchSource(client: NonNullable<CoachDeps['client']>, s: (typeof SOURCES)[number], topic: string) {
  const user: Anthropic.MessageParam = { role: 'user', content: prompt(s.what, topic) }
  const content: Anthropic.ContentBlock[] = []
  const responses: Anthropic.Message[] = []
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const messages: Anthropic.MessageParam[] = i === 0 ? [user] : [user, { role: 'assistant', content }]
    const res = await client.messages.create({
      model: COACH_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      tools: [
        { type: 'web_search_20260318', name: 'web_search', max_uses: 3, allowed_domains: s.domains, response_inclusion: 'full' },
      ],
      messages,
    })
    responses.push(res)
    content.push(...res.content)
    if (res.stop_reason !== 'pause_turn') break
  }
  return { content, responses }
}

/** Fallback when nothing verifies: search-query URLs, marked "search, not verified". */
export function searchFallback(topic: string): StudyLink[] {
  const q = encodeURIComponent(topic)
  const reason = 'search, not verified'
  return [
    { url: `https://www.youtube.com/results?search_query=${q}`, title: `YouTube search: ${topic}`, source: 'youtube', reason, verified: false },
    { url: `https://www.google.com/search?q=${q}`, title: `Google search: ${topic}`, source: 'blog', reason, verified: false },
    {
      url: `https://www.google.com/search?q=${encodeURIComponent(`${topic} explained`)}`,
      title: `Google search: ${topic} explained`,
      source: 'blog',
      reason,
      verified: false,
    },
  ]
}

/**
 * `POST /api/coach/links` with `{ key, searchTopic }`: the YouTube and blog searches in parallel,
 * verified links (or the search fallback), and the cost. The saved diagnosis is never sent or touched;
 * the browser merges the links into the note.
 */
export async function handleLinks(req: CoachRequest, deps: LinksDeps): Promise<CoachResponse> {
  const log = deps.log ?? (() => {})
  if (req.method !== 'POST' || req.path !== '/links') return { status: 404, body: { error: 'Not found' } }
  const body = req.body as { searchTopic?: unknown } | null
  const topic = typeof body?.searchTopic === 'string' ? body.searchTopic.trim() : ''
  if (!topic) return { status: 400, body: { error: 'Bad request' } }
  if (!deps.client) return { status: 401, body: { error: NO_KEY } }
  const m = month(deps.now())
  const remaining = () => Math.max(0, deps.capUsd - deps.spend.spent(m))
  if (remaining() <= 0) return { status: 402, body: { error: `Monthly coaching budget ($${deps.capUsd}) used`, remainingUsd: 0 } }

  const client = deps.client
  const settled = await Promise.allSettled(SOURCES.map((s) => searchSource(client, s, topic)))

  const usage: LinksUsage = { inputTokens: 0, outputTokens: 0, searches: 0, costUsd: 0 }
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue
    for (const res of r.value.responses) {
      usage.inputTokens += res.usage.input_tokens
      usage.outputTokens += res.usage.output_tokens
      usage.searches += res.usage.server_tool_use?.web_search_requests ?? 0
      usage.costUsd += costOf(res.usage)
    }
  }
  if (usage.costUsd > 0) deps.spend.add(m, usage.costUsd)

  if (settled.every((r) => r.status === 'rejected')) {
    const { status, error, detail } = mapError((settled[0] as PromiseRejectedResult).reason)
    log(`[coach] links ${status}${detail ? ` ${detail}` : ''}`)
    return { status, body: { error } }
  }
  const candidates = settled.flatMap((r, i) => (r.status === 'fulfilled' ? parseLinks(r.value.content, SOURCES[i].source) : []))
  const verified = await verifyLinks(candidates, deps.fetcher)
  const found = verified.length > 0 ? verified : searchFallback(topic)
  log(`[coach] links 200 in=${usage.inputTokens} out=${usage.outputTokens} searches=${usage.searches} verified=${verified.length} $${usage.costUsd.toFixed(4)}`)
  return { status: 200, body: { links: found, usage, remainingUsd: remaining() } }
}
