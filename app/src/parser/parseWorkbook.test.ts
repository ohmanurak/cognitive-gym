import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWorkbook } from './parseWorkbook'

const md = readFileSync(resolve(__dirname, '../../../workbook/Cognitive_Gym_Workbook.md'), 'utf8')
const wb = parseWorkbook(md)

describe('parseWorkbook', () => {
  it('finds every item header exactly once', () => {
    const ids = wb.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThan(400)
  })

  it('assigns week, day and block from the id', () => {
    const it = wb.items.find((i) => i.id === 'W1D1-B1')!
    expect(it).toMatchObject({ stage: 'week', week: 1, day: 1, block: 'B', points: 2, star: true })
    expect(wb.items.find((i) => i.id === 'W1D6-1')!.block).toBe('challenge')
    expect(wb.items.find((i) => i.id === 'B1-01')!.stage).toBe('baseline')
    expect(wb.items.find((i) => i.id === 'F-A1')!.stage).toBe('final')
  })

  it('attaches keys with checkable answers', () => {
    const it = wb.items.find((i) => i.id === 'W1D1-C2')!
    expect(it.key?.expected).toEqual(['37 L'])
    expect(wb.items.find((i) => i.id === 'B1-01')!.key?.expected).toEqual(['127'])
  })

  it('every item has a key (coverage)', () => {
    const missing = wb.items.filter((i) => !i.key).map((i) => i.id)
    expect(missing).toEqual([])
  })
})

describe('outline', () => {
  it('lists 12 weeks with phases and their days', () => {
    expect(wb.weeks).toHaveLength(12)
    expect(wb.weeks[0]).toMatchObject({ week: 1, phase: 'Accuracy' })
    expect(wb.weeks[11].phase).toBe('Integration')
    expect(wb.days.filter((d) => d.week === 1).map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6])
    expect(wb.days.find((d) => d.week === 1 && d.day === 1)!.title).toBe('Sequences and their differences')
  })
})

describe('audit regressions', () => {
  it('parses singular "1 pt" headers (W10D6-7 was once skipped)', () => {
    const it = wb.items.find((i) => i.id === 'W10D6-7')!
    expect(it).toMatchObject({ points: 1, trapItem: true, skill: 'IR' })
    expect(it.key?.expected).toEqual(['Second'])
  })

  it('finds all 500 items: 47 baseline, 421 programme, 32 final', () => {
    expect(wb.items).toHaveLength(500)
    expect(wb.items.filter((i) => i.stage === 'baseline')).toHaveLength(47)
    expect(wb.items.filter((i) => i.stage === 'week')).toHaveLength(421)
    expect(wb.items.filter((i) => i.stage === 'final')).toHaveLength(32)
  })
})
