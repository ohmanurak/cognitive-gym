/**
 * Coach me, server side (dev middleware `/api/coach`, wired in vite.config.ts).
 * Plain function of (request, deps): the Anthropic client, spend store and clock are injected,
 * so tests never touch the network, the real save folder or the real clock.
 */
import Anthropic from '@anthropic-ai/sdk'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const COACH_MODEL = 'claude-sonnet-5-5'
/** Claude Sonnet 5.5 list prices, USD per token. */
const PRICE = { input: 2 / 1e6, output: 10 / 1e6, search: 0.01 }

export interface CoachClient {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> }
}

export interface SpendStore {
  spent(month: string): number
  add(month: string, usd: number): void
}

export interface CoachDeps {
  /** null when no ANTHROPIC_API_KEY is set. */
  client: CoachClient | null
  spend: SpendStore
  now: () => Date
  capUsd: number
  log?: (line: string) => void
}

export interface CoachRequest {
  method: string
  path: string
  body?: unknown
}

export interface CoachResponse {
  status: number
  body: unknown
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['diagnosis', 'strategies', 'practice', 'searchTopic'],
  properties: {
    diagnosis: { type: 'string' },
    strategies: { type: 'array', items: { type: 'string' } },
    practice: { type: 'array', items: { type: 'string' } },
    searchTopic: { type: 'string' },
  },
}

/** Per "Coaching note contents and prompt" (#44). */
export const SYSTEM_PROMPT = [
  'You coach a learner working through a 12-week reasoning workbook. You get one Focus (an Error code they keep hitting, its workbook definition and the evidence) and their latest misses with that code: Item text, their Answer, the Key (answer, derivation, trap), Skill, conceptual (Con) or careless (Car), their failed assumption and their Fix.',
  'Write in second person, plain English. No praise, no hedging. The whole note must fit on one screen.',
  'diagnosis: the shared reasoning pattern across the misses, at most 150 words. Quote their failed assumptions and cite Item ids.',
  'strategies: 1 to 3 concrete Fix sentences, each a check or procedure they can run. Never "be careful", "double-check", "pay attention" or "try harder".',
  'practice: what to do this week. You may name Items listed in the misses, or describe generic drills. Never name, invent or reveal any other workbook Item.',
  'searchTopic: a short web search query for free study material on the underlying concept.',
].join('\n\n')

/** Per-miss variant (#44): one miss, where the Answer left the Key's derivation, 1 strategy, short practice. */
export const MISS_SYSTEM_PROMPT = [
  "You coach a learner working through a 12-week reasoning workbook. You get one miss: the Item text, their Answer, the Key (answer, derivation, trap), Skill, conceptual (Con) or careless (Car), their failed assumption and their Fix, plus its Error code and the code's workbook definition when it has one.",
  'Write in second person, plain English. No praise, no hedging. The whole note must fit on one screen.',
  "diagnosis: walk through where their Answer diverged from the Key's derivation, step by step, and say whether they fell into the Key's trap. At most 120 words.",
  'strategies: exactly 1 concrete Fix sentence, a check or procedure they can run. Never "be careful", "double-check", "pay attention" or "try harder".',
  'practice: 1 or 2 short items for this week. You may name this Item, or describe generic drills. Never name, invent or reveal any other workbook Item.',
  'searchTopic: a short web search query for free study material on the underlying concept.',
].join('\n\n')

export const DEFAULT_MONTHLY_USD = 5

/** Monthly cap from `COACH_MONTHLY_USD` (app/.env.local); default $5. */
export function capFromEnv(env: Record<string, string | undefined>): number {
  const n = Number(env.COACH_MONTHLY_USD)
  return env.COACH_MONTHLY_USD && Number.isFinite(n) && n >= 0 ? n : DEFAULT_MONTHLY_USD
}

/** Calendar month in local time, e.g. "2026-10". */
const month = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export const SPEND_FILE = 'coach-spend.json'

/** Running USD total per calendar month, kept as `coach-spend.json` in the save folder. */
export function createSpendStore(dir: string): SpendStore {
  const path = join(dir, SPEND_FILE)
  const read = (): Record<string, number> => {
    try {
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      return {}
    }
  }
  return {
    spent: (m) => read()[m] ?? 0,
    add: (m, usd) => {
      const totals = read()
      totals[m] = (totals[m] ?? 0) + usd
      mkdirSync(dir, { recursive: true })
      const tmp = `${path}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(totals, null, 2))
      renameSync(tmp, path)
    },
  }
}

const costOf = (u: Anthropic.Usage) =>
  (u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)) * PRICE.input +
  u.output_tokens * PRICE.output +
  (u.server_tool_use?.web_search_requests ?? 0) * PRICE.search

export const NO_KEY = 'API key missing or invalid. Set ANTHROPIC_API_KEY in app/.env.local'

/** The real client: retries off, so a failure is reported once and never billed twice. */
export function createCoachClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 0 })
}

/** Guardrails table (#49): every API failure mapped to the message shown inline. */
function mapError(e: unknown): { status: number; error: string; detail?: string } {
  if (e instanceof Anthropic.APIConnectionError) return { status: 502, error: "Couldn't reach Claude" }
  if (e instanceof Anthropic.AuthenticationError) return { status: 401, error: NO_KEY }
  if (e instanceof Anthropic.RateLimitError) {
    if (JSON.stringify(e.error ?? '').includes('enforced_spend_limit_reached'))
      return { status: 429, error: 'Anthropic spend limit reached' }
    const after = Number(e.headers?.get('retry-after'))
    return { status: 429, error: after > 0 ? `Rate limited, try again in ${Math.ceil(after)} s` : 'Rate limited, try again later' }
  }
  if (e instanceof Anthropic.BadRequestError) {
    const msg = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message
    return { status: 400, error: msg, detail: msg }
  }
  if (e instanceof Anthropic.APIError && e.status) return { status: e.status, error: `Claude error ${e.status}` }
  return { status: 502, error: "Couldn't reach Claude" }
}

export async function handleCoach(req: CoachRequest, deps: CoachDeps): Promise<CoachResponse> {
  const log = deps.log ?? (() => {})
  const m = month(deps.now())
  const remaining = () => Math.max(0, deps.capUsd - deps.spend.spent(m))
  if (req.method === 'GET' && req.path === '/health') return { status: 200, body: { ok: !!deps.client, remainingUsd: remaining(), capUsd: deps.capUsd } }
  const perMiss = req.path === '/diagnose-miss'
  if (req.method !== 'POST' || (req.path !== '/diagnose' && !perMiss)) return { status: 404, body: { error: 'Not found' } }

  const body = req.body as { payload?: unknown; basedOn?: unknown } | null
  if (!body || typeof body.payload !== 'object' || !Array.isArray(body.basedOn))
    return { status: 400, body: { error: 'Bad request' } }
  if (!deps.client) return { status: 401, body: { error: NO_KEY } }
  if (remaining() <= 0)
    return { status: 402, body: { error: `Monthly coaching budget ($${deps.capUsd}) used`, remainingUsd: 0 } }

  let res: Anthropic.Message
  try {
    res = await deps.client.messages.create({
      model: COACH_MODEL,
      max_tokens: 3000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: perMiss ? MISS_SYSTEM_PROMPT : SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(body.payload, null, 1) }],
    })
  } catch (e) {
    const { status, error, detail } = mapError(e)
    log(`[coach] diagnose ${status}${detail ? ` ${detail}` : ''}`)
    return { status, body: { error } }
  }
  const costUsd = costOf(res.usage)
  deps.spend.add(m, costUsd)
  const usage = {
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    searches: res.usage.server_tool_use?.web_search_requests ?? 0,
    costUsd,
  }
  const fail = (status: number, error: string) => {
    log(`[coach] diagnose ${status} ${res.stop_reason} in=${usage.inputTokens} out=${usage.outputTokens} $${costUsd.toFixed(4)}`)
    return { status, body: { error } }
  }
  if (res.stop_reason === 'refusal') return fail(422, 'Claude declined this one')
  let sections: unknown
  try {
    sections = JSON.parse(res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''))
  } catch {
    return fail(502, "Claude's reply was cut off. Try again.")
  }
  log(`[coach] diagnose 200 in=${usage.inputTokens} out=${usage.outputTokens} $${costUsd.toFixed(4)}`)
  return {
    status: 200,
    body: {
      note: { createdAt: deps.now().toISOString(), model: COACH_MODEL, basedOn: body.basedOn, sections, links: [], usage },
      remainingUsd: remaining(),
    },
  }
}
