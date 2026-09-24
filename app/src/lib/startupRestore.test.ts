import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from './integrity'
import { emptyState, newBlockState, type State } from './state'
import { decideStartup, isEmptyState, restoreNotice, type FileResult } from './startupRestore'

const ITEMS = { B1: ['a1', 'a2'], B2: ['b1'] }
const FP = 'fp-now'

const attempt = (answer: string) => ({ round: 1, answer }) as unknown as State['attempts'][string][number]
const withBlock = (s: State, key: string, at: number, answer = 'x'): State => ({
  ...s,
  blocks: { ...s.blocks, [key]: { ...newBlockState(), committed: true, committedAt: [at] } },
  attempts: { ...s.attempts, ...Object.fromEntries(ITEMS[key as keyof typeof ITEMS].map((id) => [id, [attempt(answer)]])) },
})
const fileOf = (state: State, over: Record<string, unknown> = {}): FileResult => ({
  status: 'ok',
  data: { app: 'cognitive-gym', schemaVersion: SCHEMA_VERSION, workbookFingerprint: FP, savedAt: '2026-03-04T05:06:07.000Z', state, ...over },
})
const run = (local: State, file: FileResult, localEmpty = isEmptyState(local)) =>
  decideStartup({ local, localEmpty, file, currentFingerprint: FP, itemsByBlock: ITEMS })

const L = withBlock(emptyState(), 'B1', 100)

describe('isEmptyState', () => {
  it('true for the empty fallback state', () => expect(isEmptyState(emptyState())).toBe(true))
  it('false with any progress', () => {
    expect(isEmptyState(L)).toBe(false)
    expect(isEmptyState({ ...emptyState(), drafts: { a1: { answer: 'x' } } as never })).toBe(false)
    expect(isEmptyState({ ...emptyState(), reflections: { k: 'x' } })).toBe(false)
  })
})

describe('decideStartup', () => {
  it('empty local + file: restore with notice', () => {
    const a = run(emptyState(), fileOf(L))
    expect(a.type).toBe('restore')
    if (a.type === 'restore') {
      expect(a.notice).toBe('Restored from ~/CognitiveGym/progress.json, saved 2026-03-04')
      expect(a.fingerprintChanged).toBe(false)
    }
  })
  it('empty local + empty file: nothing', () => expect(run(emptyState(), fileOf(emptyState())).type).toBe('none'))
  it('empty local + no file: nothing (never write an empty file)', () =>
    expect(run(emptyState(), { status: 'not-found' }).type).toBe('none'))
  it('storage present but unparseable is not empty: goes through merge preview', () => {
    expect(run(emptyState(), fileOf(L), false).type).toBe('preview')
  })
  it('user made progress while the file was loading: merge path, not restore', () => {
    expect(run(withBlock(emptyState(), 'B2', 1), fileOf(L), true).type).toBe('preview')
  })

  it('file behind local: nothing', () => {
    const local = withBlock(emptyState(), 'B1', 200)
    expect(run(local, fileOf(withBlock(emptyState(), 'B1', 100))).type).toBe('none')
  })
  it('file equal to local: nothing', () => expect(run(L, fileOf(L)).type).toBe('none'))
  it('local busy Block: nothing', () => {
    const busy: State = { ...emptyState(), blocks: { B1: { ...newBlockState(), elapsedMs: 5 } } }
    expect(run(busy, fileOf(L)).type).toBe('none')
  })
  it('file adds a Block: preview with plan', () => {
    const a = run(L, fileOf(withBlock(L, 'B2', 150)))
    expect(a.type).toBe('preview')
    if (a.type === 'preview') expect(a.plan.actions).toMatchObject({ B2: 'add' })
  })
  it('file replaces a Block: preview', () => {
    const a = run(L, fileOf(withBlock(emptyState(), 'B1', 500, 'new')))
    expect(a.type).toBe('preview')
    if (a.type === 'preview') expect(a.plan.replaced).toBe(1)
  })

  it('corrupt file: warn, saves allowed (writer backs it up)', () => {
    expect(run(L, { status: 'corrupt' })).toEqual({ type: 'warn', kind: 'corrupt', suppressSaves: false })
  })
  it('valid JSON that is not an export counts as corrupt', () => {
    expect(run(L, { status: 'ok', data: { foo: 1 } })).toMatchObject({ type: 'warn', kind: 'corrupt' })
  })
  it('newer schema: warn, saves suppressed, even with empty local', () => {
    const f = fileOf(L, { schemaVersion: SCHEMA_VERSION + 1 })
    expect(run(emptyState(), f)).toMatchObject({ type: 'warn', kind: 'newer', suppressSaves: true })
    expect(run(L, f)).toMatchObject({ type: 'warn', kind: 'newer', suppressSaves: true })
  })
  it('unreadable (500): warn, saves suppressed', () => {
    expect(run(L, { status: 'error' })).toMatchObject({ type: 'warn', kind: 'unreadable', suppressSaves: true })
  })

  it('different fingerprint flagged on restore and preview', () => {
    const f = fileOf(L, { workbookFingerprint: 'old' })
    expect(run(emptyState(), f)).toMatchObject({ type: 'restore', fingerprintChanged: true })
    expect(run(emptyState(), fileOf(withBlock(L, 'B2', 1), { workbookFingerprint: 'old' }), false)).toMatchObject({
      type: 'preview',
      fingerprintChanged: true,
    })
  })
  it('missing fingerprint (old file) is not a mismatch', () => {
    expect(run(emptyState(), fileOf(L, { workbookFingerprint: undefined }))).toMatchObject({ fingerprintChanged: false })
  })

  it('file missing + local present: write', () => expect(run(L, { status: 'not-found' }).type).toBe('write'))
  it('no writer (static host): nothing', () => expect(run(L, { status: 'unavailable' }).type).toBe('none'))
})

describe('restoreNotice', () => {
  it('handles missing date', () => expect(restoreNotice(undefined)).toBe('Restored from ~/CognitiveGym/progress.json'))
})
