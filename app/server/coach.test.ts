import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { capFromEnv, createCoachClient, createSpendStore, handleCoach, type CoachClient, type CoachDeps } from './coach.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cogym-coach-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const NOW = new Date('2026-10-02T10:00:00.000Z')
const fakeClient = (create: CoachClient['messages']['create']): CoachClient => ({ messages: { create } })
const deps = (p: Partial<CoachDeps> = {}): CoachDeps => ({
  client: fakeClient(async () => {
    throw new Error('not expected')
  }),
  spend: createSpendStore(dir),
  now: () => NOW,
  capUsd: 5,
  log: () => {},
  ...p,
})

describe('GET /health', () => {
  it('ok with the full budget (and the cap, for the over-cap message) when a key is set', async () => {
    expect(await handleCoach({ method: 'GET', path: '/health' }, deps())).toEqual({
      status: 200,
      body: { ok: true, remainingUsd: 5, capUsd: 5 },
    })
  })
  it('not ok without a key', async () => {
    const r = await handleCoach({ method: 'GET', path: '/health' }, deps({ client: null }))
    expect(r.body).toMatchObject({ ok: false })
  })
})

const SECTIONS = {
  diagnosis: 'You treat "confounder" as any third variable.\nSecond line.',
  strategies: ['Write the definition before answering.'],
  practice: ['Redo W1D1-B2 from the definition.'],
  searchTopic: 'confounding variable explained',
}
const message = (p: Partial<Anthropic.Message> = {}): Anthropic.Message =>
  ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text: JSON.stringify(SECTIONS), citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 2129, output_tokens: 802 },
    ...p,
  }) as Anthropic.Message
const BODY = {
  key: 'focus:K',
  payload: { focus: { code: 'K' }, misses: [{ id: 'W1D1-B2' }] },
  basedOn: [{ id: 'W1D1-B2', week: 1 }],
}
const diagnose = (d: CoachDeps, body: unknown = BODY) => handleCoach({ method: 'POST', path: '/diagnose', body }, d)
const COST = 2129 * 2e-6 + 802 * 10e-6

describe('POST /diagnose', () => {
  it('calls Sonnet 5.5 once with structured output and returns the note with its cost', async () => {
    const calls: Anthropic.MessageCreateParamsNonStreaming[] = []
    const d = deps({
      client: fakeClient(async (p) => {
        calls.push(p)
        return message()
      }),
    })
    const r = await diagnose(d)
    expect(calls).toHaveLength(1)
    const p = calls[0]
    expect(p).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 3000, output_config: { effort: 'low' } })
    expect(p.output_config?.format).toMatchObject({ type: 'json_schema' })
    expect(JSON.stringify(p.messages)).toContain('W1D1-B2')
    expect(p.system).toBeTruthy()
    expect(r.status).toBe(200)
    expect(r.body).toEqual({
      note: {
        createdAt: NOW.toISOString(),
        model: 'claude-sonnet-5-5',
        basedOn: BODY.basedOn,
        sections: SECTIONS,
        links: [],
        usage: { inputTokens: 2129, outputTokens: 802, searches: 0, costUsd: COST },
      },
      remainingUsd: 5 - COST,
    })
    expect(d.spend.spent('2026-10')).toBeCloseTo(COST)
  })
})

describe('monthly spend cap', () => {
  it('over the cap: no call, the budget message, and health shows nothing left', async () => {
    let called = 0
    const d = deps({
      client: fakeClient(async () => {
        called++
        return message()
      }),
    })
    d.spend.add('2026-10', 5)
    expect(await diagnose(d)).toEqual({ status: 402, body: { error: 'Monthly coaching budget ($5) used', remainingUsd: 0 } })
    expect(called).toBe(0)
    expect((await handleCoach({ method: 'GET', path: '/health' }, d)).body).toEqual({ ok: true, remainingUsd: 0, capUsd: 5 })
  })

  it('the running total persists across restarts, per calendar month', async () => {
    await diagnose(deps({ client: fakeClient(async () => message()) }))
    const restarted = createSpendStore(dir)
    expect(restarted.spent('2026-10')).toBeCloseTo(COST)
    expect(restarted.spent('2026-11')).toBe(0)
    const nextMonth = deps({ spend: restarted, now: () => new Date('2026-11-15T12:00:00.000Z') })
    expect((await handleCoach({ method: 'GET', path: '/health' }, nextMonth)).body).toEqual({ ok: true, remainingUsd: 5, capUsd: 5 })
  })

  it('defaults to $5, overridable with COACH_MONTHLY_USD', () => {
    expect(capFromEnv({})).toBe(5)
    expect(capFromEnv({ COACH_MONTHLY_USD: '2.5' })).toBe(2.5)
    expect(capFromEnv({ COACH_MONTHLY_USD: 'lots' })).toBe(5)
    expect(capFromEnv({ COACH_MONTHLY_USD: '-1' })).toBe(5)
  })
})

const apiError = (status: number, type: string, message: string, headers: Record<string, string> = {}) =>
  Anthropic.APIError.generate(status, { type: 'error', error: { type, message } }, undefined, new Headers(headers))

describe('failures (guardrails table), no retries', () => {
  it.each([
    ['401', apiError(401, 'authentication_error', 'invalid x-api-key'), 401, 'API key missing or invalid. Set ANTHROPIC_API_KEY in app/.env.local'],
    ['429 with retry-after', apiError(429, 'rate_limit_error', 'slow down', { 'retry-after': '30' }), 429, 'Rate limited, try again in 30 s'],
    ['429 without retry-after', apiError(429, 'rate_limit_error', 'slow down'), 429, 'Rate limited, try again later'],
    ['429 spend limit', apiError(429, 'rate_limit_error', 'enforced_spend_limit_reached: workspace spend limit'), 429, 'Anthropic spend limit reached'],
    ['network', new Anthropic.APIConnectionError({ message: 'fetch failed' }), 502, "Couldn't reach Claude"],
    ['400', apiError(400, 'invalid_request_error', 'output_config.format: bad schema'), 400, 'output_config.format: bad schema'],
  ])('%s', async (_case, err, status, msg) => {
    let calls = 0
    const logs: string[] = []
    const d = deps({
      client: fakeClient(async () => {
        calls++
        throw err
      }),
      log: (l) => logs.push(l),
    })
    expect(await diagnose(d)).toEqual({ status, body: { error: msg } })
    expect(calls).toBe(1)
    expect(d.spend.spent('2026-10')).toBe(0)
    expect(logs.join('\n')).toContain(String(status))
  })

  it('400 is logged to the dev-server console with its message', async () => {
    const logs: string[] = []
    const err = apiError(400, 'invalid_request_error', 'bad schema')
    await diagnose(deps({ client: fakeClient(async () => Promise.reject(err)), log: (l) => logs.push(l) }))
    expect(logs.join('\n')).toContain('bad schema')
  })

  it('refusal: "Claude declined this one", no note, but its cost still counts', async () => {
    const d = deps({ client: fakeClient(async () => message({ stop_reason: 'refusal', content: [] })) })
    expect(await diagnose(d)).toEqual({ status: 422, body: { error: 'Claude declined this one' } })
    expect(d.spend.spent('2026-10')).toBeCloseTo(COST)
  })

  it('a reply cut off at max_tokens saves nothing', async () => {
    const cut = message({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"diagnosis":"You', citations: null }] })
    const r = await diagnose(deps({ client: fakeClient(async () => cut) }))
    expect(r.status).toBe(502)
    expect(r.body).not.toHaveProperty('note')
  })

  it('no key: the diagnose call is refused without calling Claude', async () => {
    const r = await diagnose(deps({ client: null }))
    expect(r).toEqual({ status: 401, body: { error: 'API key missing or invalid. Set ANTHROPIC_API_KEY in app/.env.local' } })
  })

  it('logs status, tokens and cost only, never the request or reply', async () => {
    const logs: string[] = []
    await diagnose(deps({ client: fakeClient(async () => message()), log: (l) => logs.push(l) }))
    const out = logs.join('\n')
    expect(out).toMatch(/200/)
    expect(out).toMatch(/2129/)
    expect(out).toMatch(/802/)
    expect(out).not.toContain('confounder')
    expect(out).not.toContain('W1D1-B2')
  })

  it('the real client is built with SDK retries off', () => {
    expect(createCoachClient('sk-test').maxRetries).toBe(0)
  })
})
