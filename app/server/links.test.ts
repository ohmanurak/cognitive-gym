import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { parseLinks, verifyLinks, type Candidate, type Fetcher } from './links.ts'

/** Recorded shape of a dynamic-filtering web search reply (spike #46): results nested under code execution, citations empty. */
const result = (url: string, title: string) => ({ type: 'web_search_result', url, title, page_age: null, encrypted_content: 'enc' })
const searchBlock = (content: unknown) => ({
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_1',
  caller: { type: 'code_execution_20260120', tool_id: 'srvtoolu_0' },
  content,
})
const reply = (text: string, results: unknown = [
  result('https://www.youtube.com/watch?v=abc123', 'Confounding, explained'),
  result('https://www.youtube.com/watch?v=def456', 'Simpson’s paradox'),
]): Anthropic.ContentBlock[] =>
  [
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'confounding' } },
    searchBlock(results),
    { type: 'text', text, citations: null },
  ] as unknown as Anthropic.ContentBlock[]

describe('parseLinks', () => {
  it('keeps only reply URLs that the search returned, stripping trailing punctuation', () => {
    const text = [
      'Confounding, explained | https://www.youtube.com/watch?v=abc123. | Defines a confounder with a worked example',
      'Made up | https://www.youtube.com/watch?v=invented | Not from search',
      'Simpson | (https://www.youtube.com/watch?v=def456), | Shows the reversal',
    ].join('\n')
    expect(parseLinks(reply(text), 'youtube')).toEqual([
      { url: 'https://www.youtube.com/watch?v=abc123', title: 'Confounding, explained', source: 'youtube', reason: 'Defines a confounder with a worked example' },
      { url: 'https://www.youtube.com/watch?v=def456', title: 'Simpson’s paradox', source: 'youtube', reason: 'Shows the reversal' },
    ])
  })

  it('an error block inside a search result counts as zero links for that source', () => {
    const content = [
      ...reply('Confounding | https://www.youtube.com/watch?v=abc123 | Good'),
      searchBlock({ type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' }),
    ] as Anthropic.ContentBlock[]
    expect(parseLinks(content, 'youtube')).toEqual([])
  })

  it('a line without separators still yields a reason; duplicates are dropped', () => {
    const text = '- [Confounding](https://www.youtube.com/watch?v=abc123) - a clear worked example.\nAgain: https://www.youtube.com/watch?v=abc123'
    expect(parseLinks(reply(text), 'youtube')).toEqual([
      { url: 'https://www.youtube.com/watch?v=abc123', title: 'Confounding, explained', source: 'youtube', reason: 'a clear worked example.' },
    ])
  })
})

type Page = { status: number; body?: string } | 'throws'
/** Fake fetcher: answers by "METHOD url", records every request. */
function fakeFetcher(pages: Record<string, Page>) {
  const calls: string[] = []
  const fetcher: Fetcher = async (url, init) => {
    const k = `${init?.method ?? 'GET'} ${url}`
    calls.push(k)
    const p = pages[k]
    if (!p || p === 'throws') throw new TypeError('fetch failed')
    return { status: p.status, ok: p.status >= 200 && p.status < 300, text: async () => p.body ?? '' }
  }
  return { fetcher, calls }
}
const oembed = (u: string) => `GET https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`
const yt = (id: string): Candidate => ({ url: `https://www.youtube.com/watch?v=${id}`, title: id, source: 'youtube', reason: 'r' })
const blog = (path: string): Candidate => ({ url: `https://betterexplained.com/${path}`, title: path, source: 'blog', reason: 'r' })

describe('verifyLinks', () => {
  it('YouTube: oEmbed 200 is live, anything else is dropped', async () => {
    const { fetcher } = fakeFetcher({ [oembed(yt('live').url)]: { status: 200 }, [oembed(yt('dead').url)]: { status: 400 } })
    expect(await verifyLinks([yt('live'), yt('dead')], fetcher)).toEqual([{ ...yt('live'), verified: true }])
  })

  it('blogs: HEAD, falling back to GET; unreachable pages are dropped', async () => {
    const { fetcher, calls } = fakeFetcher({
      [`HEAD ${blog('ok').url}`]: { status: 200 },
      [`GET ${blog('ok').url}`]: { status: 200, body: '<html>free</html>' },
      [`HEAD ${blog('nohead').url}`]: { status: 405 },
      [`GET ${blog('nohead').url}`]: { status: 200, body: '<html></html>' },
      [`HEAD ${blog('gone').url}`]: { status: 404 },
      [`GET ${blog('gone').url}`]: { status: 404 },
      [`HEAD ${blog('down').url}`]: 'throws',
    })
    const r = await verifyLinks([blog('ok'), blog('nohead'), blog('gone'), blog('down')], fetcher)
    expect(r.map((l) => l.title)).toEqual(['ok', 'nohead'])
    expect(calls).toContain(`HEAD ${blog('ok').url}`)
  })

  it('blogs: pages marked isAccessibleForFree false are dropped', async () => {
    const ld = (free: string) => `<script type="application/ld+json">{"@type":"Article","isAccessibleForFree": ${free}}</script>`
    const { fetcher } = fakeFetcher({
      [`HEAD ${blog('paid').url}`]: { status: 200 },
      [`GET ${blog('paid').url}`]: { status: 200, body: ld('false') },
      [`HEAD ${blog('paid2').url}`]: { status: 200 },
      [`GET ${blog('paid2').url}`]: { status: 200, body: ld('"False"') },
      [`HEAD ${blog('free').url}`]: { status: 200 },
      [`GET ${blog('free').url}`]: { status: 200, body: ld('true') },
    })
    const r = await verifyLinks([blog('paid'), blog('paid2'), blog('free')], fetcher)
    expect(r.map((l) => l.title)).toEqual(['free'])
  })

  it('keeps at most 3 verified links per source, in reply order', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const pages: Record<string, Page> = {}
    for (const id of ids) pages[oembed(yt(id).url)] = { status: id === 'a' ? 404 : 200 }
    for (const id of ids) {
      pages[`HEAD ${blog(id).url}`] = { status: 200 }
      pages[`GET ${blog(id).url}`] = { status: 200 }
    }
    const { fetcher } = fakeFetcher(pages)
    const r = await verifyLinks([...ids.map(yt), ...ids.map(blog)], fetcher)
    expect(r.map((l) => `${l.source}:${l.title}`)).toEqual(['youtube:b', 'youtube:c', 'youtube:d', 'blog:a', 'blog:b', 'blog:c'])
  })
})
