import { describe, expect, it } from 'vitest'
import { normalise, suggest } from './grade'

describe('suggest', () => {
  it('matches a single expected answer loosely', () => {
    expect(suggest('127', ['127'], false)).toBe('full')
    expect(suggest(' 37 l ', ['37 L'], false)).toBe('full')
    expect(suggest('10,458', ['10,458'], false)).toBe('full')
    expect(suggest('10458', ['10,458'], false)).toBe('full')
  })

  it('requires every expected part for multi-part answers', () => {
    expect(suggest('(a) 79 (b) 720 (c) 70', ['79', '720', '70'], false)).toBe('full')
    expect(suggest('79, 720', ['79', '720', '70'], false)).toBe('unsure')
  })

  it('never auto-suggests for open items', () => {
    expect(suggest('anything', [], true)).toBe('none')
    expect(suggest('anything', ['x'], true)).toBe('none')
  })

  it('normalises whitespace and case', () => {
    expect(normalise('  Blue ')).toBe('blue')
  })
})
