import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSpendStore, handleCoach, SYSTEM_PROMPT, type CoachClient, type CoachDeps } from './coach.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cogym-coach-miss-'))
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

const SECTIONS = {
  diagnosis: 'Your Answer took the first branch; the Key splits on the base rate first. You fell into the trap.',
  strategies: ['Write the base rate down before reading the evidence.'],
  practice: ['Redo W1D1-B2 from the base rate.'],
  searchTopic: 'base rate neglect',
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
    usage: { input_tokens: 1000, output_tokens: 300 },
    ...p,
  }) as Anthropic.Message
const BODY = {
  key: 'miss:W1D1-B2',
  payload: {
    miss: { id: 'W1D1-B2', answer: 'my answer', key: { answer: '42', derivation: 'step 1, step 2', trap: 'ignoring the base rate' } },
    code: { code: 'L', name: 'Logic error', definition: 'Invalid inference' },
  },
  basedOn: [{ id: 'W1D1-B2', week: 1 }],
}
const diagnoseMiss = (d: CoachDeps, body: unknown = BODY) => handleCoach({ method: 'POST', path: '/diagnose-miss', body }, d)

describe('POST /diagnose-miss (per-miss note)', () => {
  it('calls Claude once with the per-miss prompt and the one miss, and returns the note built on it', async () => {
    const calls: Anthropic.MessageCreateParamsNonStreaming[] = []
    const d = deps({
      client: fakeClient(async (p) => {
        calls.push(p)
        return message()
      }),
    })
    const r = await diagnoseMiss(d)
    expect(calls).toHaveLength(1)
    const p = calls[0]
    expect(p).toMatchObject({ model: 'claude-sonnet-5-5', output_config: { effort: 'low', format: { type: 'json_schema' } } })
    expect(p.system).not.toBe(SYSTEM_PROMPT)
    expect(p.system).toMatch(/diverged from the Key's derivation/)
    expect(p.system).toMatch(/trap/)
    expect(p.system).toMatch(/exactly 1/)
    const sent = JSON.stringify(p.messages)
    expect(sent).toContain('W1D1-B2')
    expect(sent).toContain('ignoring the base rate')
    const cost = 1000 * 2e-6 + 300 * 10e-6
    expect(r.status).toBe(200)
    expect(r.body).toEqual({
      note: {
        createdAt: NOW.toISOString(),
        model: 'claude-sonnet-5-5',
        basedOn: [{ id: 'W1D1-B2', week: 1 }],
        sections: SECTIONS,
        links: [],
        usage: { inputTokens: 1000, outputTokens: 300, searches: 0, costUsd: cost },
      },
      remainingUsd: 5 - cost,
    })
  })

  it('shares the guardrails: the spend cap, bad requests and mapped failures', async () => {
    const over = deps({ capUsd: 0 })
    expect((await diagnoseMiss(over)).status).toBe(402)
    expect((await diagnoseMiss(deps(), { key: 'miss:x' })).status).toBe(400)
    const calls: unknown[] = []
    const failing = deps({
      client: fakeClient(async () => {
        calls.push(1)
        throw new Anthropic.APIConnectionError({ message: 'down' })
      }),
    })
    expect(await diagnoseMiss(failing)).toEqual({ status: 502, body: { error: "Couldn't reach Claude" } })
    expect(calls).toHaveLength(1)
  })
})
