import { describe, expect, it } from 'vitest'
import { hintText, splitParts, suggestParts } from './grade'

const run = (answer: string, expected: string[], points = 3, keyAnswer?: string, open = false) =>
  suggestParts(answer, expected, open, points, keyAnswer)

describe('numeric core', () => {
  it('ignores trailing units', () => {
    expect(run('37', ['37 L'], 1).status).toBe('full')
    expect(run('24', ['24 km/h'], 1).status).toBe('full')
    expect(run('38', ['37 L'], 1).status).toBe('unsure')
  })
  it('accepts equivalent forms', () => {
    expect(run('0.75', ['3/4'], 1).status).toBe('full')
    expect(run('75%', ['0.75'], 1).status).toBe('full')
    expect(run('3/4', ['0.75'], 1).status).toBe('full')
    expect(run('60', ['60%'], 1).status).toBe('full')
  })
  it('handles thousands separators and unicode minus', () => {
    expect(run('10458', ['10,458'], 1).status).toBe('full')
    expect(run('10,458', ['10458'], 1).status).toBe('full')
    expect(run('-9200', ['−9,200'], 1).status).toBe('full')
    expect(run('9200', ['−9,200'], 1).status).toBe('unsure')
  })
  it('gives 1% tolerance only for approximate Keys', () => {
    expect(run('0.031', ['1/33 ≈ 3.0 %'], 1).found).toBe(0)
    expect(run('1/33', ['1/33 ≈ 3.0 %'], 1).status).toBe('full')
    expect(run('3.02', ['≈ 3.0%'], 1).status).toBe('full')
    expect(run('3.1', ['≈ 3.0%'], 1).status).toBe('unsure')
    expect(run('3.02', ['3.0'], 1).status).toBe('unsure')
  })
})

describe('multi-part', () => {
  const key = '(a) **43** (b) **23** (c) **62.5** (d) **66** (e) **38**'
  const exp = ['43', '23', '62.5', '66', '38']
  it('reports found N of M with the missing part named', () => {
    const s = run('a) 43 b) 23 c) 62.5 d) 66', exp, 5, key)
    expect(s).toMatchObject({ found: 4, total: 5, missing: ['part e'], hintScore: 4, status: 'partial' })
    expect(hintText(s, false)).toContain('found 4 of 5, missing part e')
  })
  it('a repeated number does not count twice', () => {
    const s = run('(a) 100 (b) 150', ['100', '150', '≈ 100'], 4)
    expect(s.found).toBe(2)
  })
  it('splits labels, lines, commas and semicolons', () => {
    expect(splitParts('(a) 4 (b) D (c) 33')).toEqual(['(a) 4', '(b) D', '(c) 33'])
    expect(splitParts('a. 4\nb. D\nc. 33')).toEqual(['a. 4', 'b. D', 'c. 33'])
    expect(splitParts('4, D, 33')).toEqual(['4', 'D', '33'])
    expect(splitParts('4; D; 33')).toEqual(['4', 'D', '33'])
    expect(splitParts('10,458')).toEqual(['10,458'])
  })
  it('scores untouched answers as unsure with hint 0', () => {
    expect(run('', exp, 5, key)).toMatchObject({ status: 'unsure', found: 0, hintScore: 0 })
  })
  it('finds freely typed parts by substring', () => {
    expect(run('4 D 33', ['4', 'D', '33'], 3, '(a) **4** (b) **D** (c) **33**').status).toBe('full')
  })
})

describe('alternatives and text', () => {
  const key = '(a) **25** (square) **or 15** (×3) (b) **Cube** (c) **Area under the curve** (d) **O(log n)** (e) **False negatives**'
  const exp = ['25', 'or 15', 'Cube', 'Area under the curve', 'O(log n)', 'False negatives']
  it('X or Y accepts either (W1D3-B1)', () => {
    const base = 'b) cube c) area under the curve d) O(log n) e) false negatives'
    const one = run(`a) 25 ${base}`, exp, 5, key)
    const other = run(`a) 15 ${base}`, exp, 5, key)
    expect(one).toMatchObject({ total: 5, found: 5 })
    expect(other).toMatchObject({ total: 5, found: 5 })
    expect(run(`a) 20 ${base}`, exp, 5, key)).toMatchObject({ found: 4, missing: ['part a'] })
  })
  it('inline or accepts either (W6D4-B1)', () => {
    expect(run('Z', ['X or Z'], 1).status).toBe('full')
    expect(run('Y', ['X or Z'], 1).status).toBe('unsure')
  })
  it('arrow accepts final value or whole phrase (B1-13)', () => {
    expect(run('36', ['35 → should be 36'], 1).status).toBe('full')
    expect(run('35 -> should be 36', ['35 → should be 36'], 1).status).toBe('full')
    expect(run('37', ['35 → should be 36'], 1).status).toBe('unsure')
    expect(run('1354320', ['1,200,000 → 1,354,320'], 1).status).toBe('full')
  })
  it('text ignores case and punctuation', () => {
    expect(run('CUBE!', ['Cube'], 1).status).toBe('full')
    expect(run('o(log  n)', ['O(log n)'], 1).status).toBe('full')
    expect(run('a knight', ['A is a knight'], 1).status).toBe('unsure')
  })
  it('semicolon parts match in any order', () => {
    const t = '12 days; both routes T1→T2→T4 and T1→T3→T4 are critical'
    expect(run('both routes T1-T2-T4 and T1-T3-T4 are critical, 12 days', [t], 1).status).toBe('full')
    expect(run('12 days', [t], 1).status).toBe('unsure')
  })
  it('no synonyms', () => {
    expect(run('true negatives', ['False negatives'], 1).status).toBe('unsure')
  })
})

describe('mixed and open', () => {
  const key = '(a) **1/33 ≈ 3.0 %** (b) **1/17 ≈ 5.9 %** (c) see below'
  const exp = ['1/33 ≈ 3.0 %', '1/17 ≈ 5.9 %']
  it('checks only checkable parts and labels the rest self-score (F-D2)', () => {
    const s = run('(a) 1/33 (b) 1/17 (c) it depends on the information', exp, 3, key, true)
    expect(s).toMatchObject({ status: 'full', found: 2, total: 2, mixed: true, hintScore: null })
    expect(hintText(s, true)).toContain('self-score')
    expect(run('(a) 1/33 (b) 1/16', exp, 3, key, true)).toMatchObject({ found: 1, missing: ['part b'] })
  })
  it('pure open Items get no suggestion', () => {
    expect(run('anything', [], 3, undefined, true).status).toBe('none')
    expect(hintText(undefined, true)).toContain('rubric')
  })
})
