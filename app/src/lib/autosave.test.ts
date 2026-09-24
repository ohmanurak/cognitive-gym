import { describe, expect, it } from 'vitest'
import { createAutosaver, type AutosaveDeps } from './autosave'

type Res = { status: number; body: unknown } | 'throw'

function rig(initial: string[] = []) {
  let t = 0
  let ms = new Set(initial)
  const timers = new Map<number, { at: number; fn: () => void }>()
  let nextId = 1
  const calls: { url: string; body: string }[] = []
  const r = {
    replies: [] as Res[],
    setMilestones: (m: string[]) => (ms = new Set(m)),
    advance(d: number) {
      t += d
      for (const [id, x] of [...timers]) {
        if (x.at <= t) {
          timers.delete(id)
          x.fn()
        }
      }
    },
    calls,
    pending: () => timers.size,
  }
  const deps: AutosaveDeps = {
    now: () => t,
    setTimer: (fn, d) => {
      const id = nextId++
      timers.set(id, { at: t + d, fn })
      return id
    },
    clearTimer: (h) => void timers.delete(h as number),
    fetch: async (url, init) => {
      calls.push({ url, body: init.body })
      const reply = r.replies.shift() ?? { status: 200, body: { ok: true } }
      if (reply === 'throw') throw new TypeError('fetch failed')
      return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body }
    },
    milestones: () => ms,
    body: () => JSON.stringify({ app: 'cognitive-gym', n: calls.length }),
  }
  return { a: createAutosaver(deps), r }
}
type Rig = ReturnType<typeof rig>
const settle = () => new Promise((res) => setTimeout(res, 0))
const trigger = async ({ a, r }: Rig, m: string[]) => {
  r.setMilestones(m)
  a.notify()
  r.advance(2000)
  await settle()
}

describe('autosave triggers and debounce', () => {
  it('a new completion milestone triggers one save after 2 s', async () => {
    const { a, r } = rig()
    r.setMilestones(['commit:A:1'])
    a.notify()
    r.advance(1999)
    await settle()
    expect(r.calls).toHaveLength(0)
    r.advance(1)
    await settle()
    expect(r.calls).toHaveLength(1)
    expect(a.getStatus()).toBe('on')
  })
  it('a burst of milestones debounces into one save', async () => {
    const { a, r } = rig()
    r.setMilestones(['c1'])
    a.notify()
    r.advance(1500)
    r.setMilestones(['c1', 'c2'])
    a.notify()
    r.advance(1500)
    await settle()
    expect(r.calls).toHaveLength(0)
    r.advance(500)
    await settle()
    expect(r.calls).toHaveLength(1)
  })
  it('changes with no new milestone (drafts, timers, focus) never save', async () => {
    const { a, r } = rig(['c1'])
    for (let i = 0; i < 5; i++) a.notify()
    r.advance(60000)
    await settle()
    expect(r.calls).toHaveLength(0)
    expect(r.pending()).toBe(0)
  })
  it('milestones existing at startup are not saved', async () => {
    const { a, r } = rig(['c1'])
    a.notify()
    r.advance(5000)
    await settle()
    expect(r.calls).toHaveLength(0)
  })
})

describe('hidden-tab flush', () => {
  it('flushes only when the milestones changed since the last save', async () => {
    const { a, r } = rig(['c1'])
    a.flush()
    await settle()
    expect(r.calls).toHaveLength(0)
    r.setMilestones(['c1', 'c2'])
    a.flush()
    await settle()
    expect(r.calls).toHaveLength(1)
    a.flush()
    await settle()
    expect(r.calls).toHaveLength(1)
  })
  it('flush cancels the pending debounce (no double write)', async () => {
    const { a, r } = rig()
    r.setMilestones(['c1'])
    a.notify()
    a.flush()
    await settle()
    r.advance(5000)
    await settle()
    expect(r.calls).toHaveLength(1)
  })
})

describe('backup cadence', () => {
  it('asks for a backup first, then only after 10 minutes', async () => {
    const g = rig()
    await trigger(g, ['1'])
    expect(g.r.calls[0].url).toBe('/api/progress?backup=1')
    g.r.advance(5 * 60000)
    await trigger(g, ['1', '2'])
    expect(g.r.calls[1].url).toBe('/api/progress')
    g.r.advance(5 * 60000)
    await trigger(g, ['1', '2', '3'])
    expect(g.r.calls[2].url).toBe('/api/progress?backup=1')
  })
  it('a failed save does not reset the backup clock', async () => {
    const g = rig()
    g.r.replies.push({ status: 500, body: { error: 'disk' } })
    await trigger(g, ['1'])
    await trigger(g, ['1', '2'])
    expect(g.r.calls[1].url).toBe('/api/progress?backup=1')
  })
})

describe('status', () => {
  it('is pending before any save', () => {
    expect(rig().a.getStatus()).toBe('pending')
  })
  it('writer errors are failed; retry only on the next trigger; success clears it', async () => {
    const g = rig()
    g.r.replies.push({ status: 500, body: { error: 'disk full' } })
    await trigger(g, ['1'])
    expect(g.a.getStatus()).toBe('failed')
    g.r.advance(3600000)
    g.a.notify()
    await settle()
    expect(g.r.calls).toHaveLength(1)
    expect(g.a.getStatus()).toBe('failed')
    await trigger(g, ['1', '2'])
    expect(g.a.getStatus()).toBe('on')
    expect(g.r.calls).toHaveLength(2)
  })
  it('no writer (network error, 404, html 200) is off and never throws', async () => {
    const g = rig()
    g.r.replies.push('throw', { status: 404, body: {} }, { status: 200, body: '<html>' })
    await trigger(g, ['1'])
    expect(g.a.getStatus()).toBe('off')
    await trigger(g, ['1', '2'])
    expect(g.a.getStatus()).toBe('off')
    await trigger(g, ['1', '2', '3'])
    expect(g.a.getStatus()).toBe('off')
  })
  it('notifies subscribers on status change only', async () => {
    const g = rig()
    const seen: string[] = []
    g.a.subscribe(() => seen.push(g.a.getStatus()))
    g.r.replies.push({ status: 500, body: { error: 'x' } })
    await trigger(g, ['1'])
    await trigger(g, ['1', '2'])
    await trigger(g, ['1', '2', '3'])
    expect(seen).toEqual(['failed', 'on'])
  })
})
