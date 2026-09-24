// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { actions, getState, setReadOnly } from './store'

afterEach(() => {
  setReadOnly(false)
  actions.reset()
  localStorage.clear()
})

describe('store in a read-only tab', () => {
  it('writable: an action changes state and writes localStorage', () => {
    actions.setDraft('a1', { answer: 'x' })
    expect(getState().drafts.a1?.answer).toBe('x')
    expect(localStorage.getItem('cognitive-gym:v1')).toContain('"x"')
  })

  it('read-only: every action is a no-op and nothing is written', () => {
    actions.setDraft('a1', { answer: 'x' })
    const before = getState()
    localStorage.removeItem('cognitive-gym:v1')
    setReadOnly(true)
    actions.setDraft('a1', { answer: 'y' })
    actions.startClock('B')
    actions.setReflection('r', 'text')
    actions.setWeekAnswer(1, 0, 'z')
    actions.addSpan({} as never)
    actions.startSpanTest('forward' as never)
    actions.importJson(JSON.stringify({ app: 'cognitive-gym', state: {} }))
    actions.reset()
    expect(getState()).toBe(before)
    expect(localStorage.getItem('cognitive-gym:v1')).toBeNull()
  })
})
