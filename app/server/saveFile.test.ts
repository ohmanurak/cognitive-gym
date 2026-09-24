import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_BACKUPS, readProgress, resolveSaveDir, writeProgress } from './saveFile.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cogym-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const body = { app: 'cognitive-gym', schemaVersion: 3, workbookFingerprint: 'abc', state: { a: 1 } }
const NOW = new Date('2026-01-02T03:04:05.000Z')

describe('resolveSaveDir', () => {
  it('uses COGYM_SAVE_DIR override', () => {
    expect(resolveSaveDir({ COGYM_SAVE_DIR: dir })).toBe(dir)
  })
  it('defaults to ~/CognitiveGym', () => {
    expect(resolveSaveDir({}).endsWith('CognitiveGym')).toBe(true)
  })
})

describe('readProgress', () => {
  it('not-found when missing', () => {
    expect(readProgress(dir)).toEqual({ status: 'not-found' })
  })
  it('returns the file', () => {
    writeProgress(dir, body, { now: NOW })
    const r = readProgress(dir)
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.data).toMatchObject(body)
  })
  it('reports corrupt', () => {
    writeFileSync(join(dir, 'progress.json'), '{nope')
    expect(readProgress(dir).status).toBe('corrupt')
  })
})

describe('writeProgress', () => {
  it('creates missing folder, adds savedAt, keeps fingerprint/schema', () => {
    const sub = join(dir, 'x', 'y')
    expect(writeProgress(sub, body, { now: NOW }).ok).toBe(true)
    const saved = JSON.parse(readFileSync(join(sub, 'progress.json'), 'utf8'))
    expect(saved).toMatchObject({ ...body, savedAt: NOW.toISOString() })
  })
  it('leaves no temp files (atomic rename)', () => {
    writeProgress(dir, body, { now: NOW })
    writeProgress(dir, body, { now: NOW })
    expect(readdirSync(dir)).toEqual(['progress.json'])
  })
  it('no backup unless asked', () => {
    writeProgress(dir, body, { now: NOW })
    expect(readdirSync(dir)).not.toContain('backups')
  })
  it('backup writes timestamped copy', () => {
    writeProgress(dir, body, { now: NOW, backup: true })
    expect(readdirSync(join(dir, 'backups'))).toEqual(['progress-2026-01-02T03-04-05.000Z.json'])
  })
  it('prunes to newest MAX_BACKUPS', () => {
    for (let i = 0; i < MAX_BACKUPS + 4; i++)
      writeProgress(dir, body, { now: new Date(NOW.getTime() + i * 1000), backup: true })
    const files = readdirSync(join(dir, 'backups')).sort()
    expect(files).toHaveLength(MAX_BACKUPS)
    expect(files[files.length - 1]).toContain('03-04-18')
    expect(files[0]).toContain('03-04-09')
  })
  it('moves corrupt existing file into backups first', () => {
    writeFileSync(join(dir, 'progress.json'), '{nope')
    writeProgress(dir, body, { now: NOW })
    const b = readdirSync(join(dir, 'backups'))
    expect(b).toHaveLength(1)
    expect(b[0]).toMatch(/corrupt/)
    expect(readFileSync(join(dir, 'backups', b[0]), 'utf8')).toBe('{nope')
    expect(readProgress(dir).status).toBe('ok')
  })
  it('rejects non-cognitive-gym body', () => {
    expect(writeProgress(dir, { foo: 1 }, { now: NOW })).toMatchObject({ ok: false, status: 400 })
  })
  it('unwritable folder returns error, no throw', () => {
    const blocker = join(dir, 'file')
    writeFileSync(blocker, 'x')
    expect(writeProgress(join(blocker, 'sub'), body, { now: NOW })).toMatchObject({ ok: false, status: 500 })
  })
})
