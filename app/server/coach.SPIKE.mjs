// SPIKE (throwaway): one real Coaching note round-trip. Prints usage, costs, URL presence, error shapes.
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'

const APP = 'C:/Users/Acer/Desktop/iq/app'
const env = readFileSync(`${APP}/.env.local`, 'utf8').match(/ANTHROPIC_API_KEY=(\S+)/)[1]
const client = new Anthropic({ apiKey: env })
const MODEL = 'claude-sonnet-5-5'
const PRICE = { in: 2 / 1e6, out: 10 / 1e6, search: 0.01 }
const cost = (u) => (u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)) * PRICE.in + u.output_tokens * PRICE.out + (u.server_tool_use?.web_search_requests ?? 0) * PRICE.search
const log = {}

// ---- Payload: real K Focus (latest misses with code K) ----
const wb = JSON.parse(readFileSync(`${APP}/src/data/workbook.json`, 'utf8'))
const items = new Map(wb.items.map((i) => [i.id, i]))
const st = JSON.parse(readFileSync(`${homedir()}/CognitiveGym/progress.json`, 'utf8')).state
const misses = Object.entries(st.attempts).flatMap(([id, l]) => l.filter((a) => a.round === 1 && a.errorCode === 'K').map((a) => ({ id, a }))).slice(-5)
const payload = misses.map(({ id, a }) => {
  const it = items.get(id)
  return { id, skill: it.skill, points: it.points, score: a.score, item: it.body, answer: a.answer ?? a.text ?? null, key: it.key, conCar: a.nature ?? null, failedAssumption: a.assumption || null, fix: a.fix || null }
})
const focus = { code: 'K', name: 'Knowledge gap', definition: 'Missing definition or fact (e.g. what a "confounder" is).', misses: payload.length, weeks: ['Baseline', 1] }

// ---- Call 1: diagnosis, structured, no tools ----
const schema = {
  type: 'object', additionalProperties: false,
  required: ['diagnosis', 'strategies', 'practice', 'searchTopic'],
  properties: {
    diagnosis: { type: 'string' },
    strategies: { type: 'array', items: { type: 'string' } },
    practice: { type: 'array', items: { type: 'string' } },
    searchTopic: { type: 'string' },
  },
}
let t = Date.now()
const r1 = await client.messages.create({
  model: MODEL, max_tokens: 3000, output_config: { effort: 'low', format: { type: 'json_schema', schema } },
  system: 'You coach a learner doing a 12-week reasoning workbook. Second person, plain English, no praise, no hedging. Diagnosis <=150 words, quoting failed assumptions and Item ids. 1-3 strategies, each a concrete check or procedure (never "be careful"). Practice: only Items listed below or generic drills; never invent workbook Items. searchTopic: a short web search query for free study material on the underlying concept.',
  messages: [{ role: 'user', content: `Focus:\n${JSON.stringify(focus)}\n\nMisses:\n${JSON.stringify(payload, null, 1)}` }],
})
log.diagnosis = { ms: Date.now() - t, stop: r1.stop_reason, usage: r1.usage, cost: cost(r1.usage), json: JSON.parse(r1.content.find((b) => b.type === 'text').text) }
const topic = log.diagnosis.json.searchTopic

// ---- Calls 2/3: link search, YouTube + blog allow-list; compare response_inclusion ----
const BLOGS = ['khanacademy.org', 'betterexplained.com', 'statisticsbyjim.com', 'brilliant.org', 'lesswrong.com', 'scribbr.com', 'mathsisfun.com', 'towardsdatascience.com']
async function links(label, domains, inclusion) {
  const t0 = Date.now()
  const r = await client.messages.create({
    model: MODEL, max_tokens: 2000, output_config: { effort: 'low' },
    tools: [{ type: 'web_search_20260318', name: 'web_search', max_uses: 3, allowed_domains: domains, response_inclusion: inclusion }],
    messages: [{ role: 'user', content: `Find 2-3 free, beginner-friendly ${label} that teach: ${topic}. One line per pick: title, URL, why it helps.` }],
  })
  const types = r.content.map((b) => b.type)
  const resultUrls = r.content.filter((b) => b.type === 'web_search_tool_result' && Array.isArray(b.content)).flatMap((b) => b.content.map((c) => c.url))
  const citeUrls = r.content.filter((b) => b.type === 'text').flatMap((b) => (b.citations ?? []).map((c) => c.url))
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const textUrls = text.match(/https?:\/\/[^\s)\]]+/g) ?? []
  return { ms: Date.now() - t0, stop: r.stop_reason, usage: r.usage, cost: cost(r.usage), blockTypes: [...new Set(types)], resultUrls, citeUrls: [...new Set(citeUrls)], textUrls, textUrlsNotFromSearch: textUrls.filter((u) => !resultUrls.includes(u) && !citeUrls.includes(u)), text }
}
const [yt, blogFull, blogExcl] = await Promise.all([
  links('YouTube videos', ['youtube.com'], 'excluded'),
  links('articles or blog posts', BLOGS, 'full'),
  links('articles or blog posts', BLOGS, 'excluded'),
])
Object.assign(log, { yt, blogFull, blogExcl })

// ---- Verify YouTube links via oEmbed ----
const ytUrls = [...new Set([...yt.resultUrls, ...yt.citeUrls, ...yt.textUrls])].filter((u) => /youtube\.com\/watch|youtu\.be/.test(u))
log.oembed = await Promise.all(ytUrls.slice(0, 5).map(async (u) => ({ u, status: (await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`)).status })))

// ---- Error shapes ----
try { await client.messages.create({ model: MODEL, max_tokens: 50, tools: [{ type: 'web_search_20260318', name: 'web_search', allowed_domains: ['a.com'], blocked_domains: ['b.com'] }], messages: [{ role: 'user', content: 'hi' }] }); log.errBoth = 'no error' }
catch (e) { log.errBoth = { status: e.status, type: e.error?.error?.type, message: e.error?.error?.message } }
try { await new Anthropic({ apiKey: 'sk-ant-invalid' }).messages.create({ model: MODEL, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }); log.errKey = 'no error' }
catch (e) { log.errKey = { status: e.status, type: e.error?.error?.type } }

const total = log.diagnosis.cost + yt.cost + blogExcl.cost
log.summary = { perNote_usd: +total.toFixed(4), diagnosis_usd: +log.diagnosis.cost.toFixed(4), yt_usd: +yt.cost.toFixed(4), blogFull_usd: +blogFull.cost.toFixed(4), blogExcl_usd: +blogExcl.cost.toFixed(4) }
writeFileSync('spike-result.json', JSON.stringify(log, null, 2))
console.log(JSON.stringify({ summary: log.summary, diagMs: log.diagnosis.ms, diagUsage: log.diagnosis.usage, yt: { ms: yt.ms, usage: yt.usage, types: yt.blockTypes, results: yt.resultUrls.length, cites: yt.citeUrls.length, invented: yt.textUrlsNotFromSearch }, blogFull: { usage: blogFull.usage, types: blogFull.blockTypes, results: blogFull.resultUrls.length, cites: blogFull.citeUrls.length, invented: blogFull.textUrlsNotFromSearch }, blogExcl: { usage: blogExcl.usage, types: blogExcl.blockTypes, results: blogExcl.resultUrls.length, cites: blogExcl.citeUrls.length, invented: blogExcl.textUrlsNotFromSearch }, oembed: log.oembed, errBoth: log.errBoth, errKey: log.errKey }, null, 1))
