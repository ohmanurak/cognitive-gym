import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const MAX_BACKUPS = 10
const FILE = 'progress.json'

export function resolveSaveDir(env: Record<string, string | undefined> = process.env): string {
  return env.COGYM_SAVE_DIR || join(homedir(), 'CognitiveGym')
}

export type ReadResult =
  | { status: 'ok'; data: Record<string, unknown> }
  | { status: 'not-found' }
  | { status: 'corrupt' }
  | { status: 'error'; message: string }

export function readProgress(dir: string): ReadResult {
  const path = join(dir, FILE)
  if (!existsSync(path)) return { status: 'not-found' }
  try {
    return { status: 'ok', data: JSON.parse(readFileSync(path, 'utf8')) }
  } catch (e) {
    return e instanceof SyntaxError ? { status: 'corrupt' } : { status: 'error', message: String(e) }
  }
}

export type WriteResult = { ok: true; savedAt: string } | { ok: false; status: number; error: string }

const stamp = (d: Date) => d.toISOString().replace(/:/g, '-')

/** Atomic write of progress.json (temp file then rename). Payload = export JSON + savedAt. */
export function writeProgress(
  dir: string,
  body: unknown,
  opts: { backup?: boolean; now?: Date } = {},
): WriteResult {
  const now = opts.now ?? new Date()
  const b = body as Record<string, unknown> | null
  if (!b || typeof b !== 'object' || b.app !== 'cognitive-gym' || !b.state)
    return { ok: false, status: 400, error: 'Not a Cognitive Gym export' }
  const savedAt = now.toISOString()
  const text = JSON.stringify({ ...b, savedAt }, null, 2)
  try {
    const backups = join(dir, 'backups')
    mkdirSync(dir, { recursive: true })
    const current = join(dir, FILE)
    if (readProgress(dir).status === 'corrupt') {
      mkdirSync(backups, { recursive: true })
      renameSync(current, join(backups, `progress-${stamp(now)}.corrupt.json`))
    }
    const tmp = join(dir, `${FILE}.${process.pid}.tmp`)
    writeFileSync(tmp, text)
    renameSync(tmp, current)
    if (opts.backup) {
      mkdirSync(backups, { recursive: true })
      writeFileSync(join(backups, `progress-${stamp(now)}.json`), text)
    }
    if (existsSync(backups)) {
      const files = readdirSync(backups)
        .filter((f) => /^progress-.*\.json$/.test(f))
        .sort()
      for (const f of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) rmSync(join(backups, f), { force: true })
    }
    return { ok: true, savedAt }
  } catch (e) {
    return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) }
  }
}
