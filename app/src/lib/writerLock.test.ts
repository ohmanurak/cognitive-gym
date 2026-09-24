import { describe, expect, it } from 'vitest'
import { createWriterLock, LOCK_NAME, type LocksLike } from './writerLock'

/** Minimal fake of navigator.locks: exclusive locks held until the callback promise settles or the lock is stolen. */
function fakeLocks() {
  const held = new Map<string, { reject: (e: unknown) => void }>()
  const locks: LocksLike = {
    request(name, options, cb) {
      return new Promise((resolve, reject) => {
        const cur = held.get(name)
        if (cur && options.ifAvailable) return resolve(cb(null))
        if (cur && options.steal) cur.reject(new DOMException('stolen', 'AbortError'))
        else if (cur) return // would queue; never used here
        held.set(name, { reject })
        Promise.resolve(cb({ name })).then(resolve, reject)
      })
    },
  }
  return { locks, isHeld: (n: string) => held.has(n), closeTab: () => held.clear() }
}

describe('createWriterLock', () => {
  it('first tab becomes the writer', async () => {
    const f = fakeLocks()
    const a = createWriterLock({ locks: f.locks })
    expect(a.getRole()).toBe('pending')
    await a.start()
    expect(a.getRole()).toBe('writer')
    expect(f.isHeld(LOCK_NAME)).toBe(true)
  })

  it('a later tab is read-only', async () => {
    const f = fakeLocks()
    await createWriterLock({ locks: f.locks }).start()
    const b = createWriterLock({ locks: f.locks })
    await b.start()
    expect(b.getRole()).toBe('readonly')
  })

  it('a closed writer tab frees the lock for the next tab', async () => {
    const f = fakeLocks()
    await createWriterLock({ locks: f.locks }).start()
    f.closeTab()
    const b = createWriterLock({ locks: f.locks })
    await b.start()
    expect(b.getRole()).toBe('writer')
  })

  it('never takes over automatically', async () => {
    const f = fakeLocks()
    const a = createWriterLock({ locks: f.locks })
    await a.start()
    const b = createWriterLock({ locks: f.locks })
    await b.start()
    expect(a.getRole()).toBe('writer')
    expect(b.getRole()).toBe('readonly')
  })

  it('takeover steals the lock; the old writer drops to read-only and is notified', async () => {
    const f = fakeLocks()
    const a = createWriterLock({ locks: f.locks })
    await a.start()
    const seen: string[] = []
    a.subscribe(() => seen.push(a.getRole()))
    const b = createWriterLock({ locks: f.locks })
    await b.start({ steal: true })
    expect(b.getRole()).toBe('writer')
    await Promise.resolve()
    expect(a.getRole()).toBe('readonly')
    expect(seen).toEqual(['readonly'])
  })

  it('without Web Locks it is the writer (last write wins), no error', async () => {
    const a = createWriterLock({ locks: undefined })
    await a.start()
    expect(a.getRole()).toBe('writer')
  })

  it('a locks API that throws falls back to writer', async () => {
    const a = createWriterLock({
      locks: {
        request() {
          throw new Error('SecurityError')
        },
      },
    })
    await a.start()
    expect(a.getRole()).toBe('writer')
  })
})
