import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blockByKey, blocks, freezeMin, itemById } from './structure'

const md = readFileSync(resolve(__dirname, '../../../workbook/Cognitive_Gym_Workbook.md'), 'utf8')

const b = (key: string) => {
  const def = blockByKey.get(key)
  if (!def) throw new Error(`no block ${key}`)
  return def
}

describe('Block limits derived from the workbook', () => {
  it('reads a limit label from the Block first Item', () => {
    expect(b('w1d1:A')).toMatchObject({ limitMin: 10, strict: false, limitSource: 'label' })
    expect(b('w1d1:B')).toMatchObject({ limitMin: 15, limitSource: 'label' })
    expect(b('w9d1:A')).toMatchObject({ limitMin: 6, strict: false, limitSource: 'label' })
    expect(b('w11d1:B')).toMatchObject({ limitMin: 12, limitSource: 'label' })
  })

  it('uses the upper end of a stated range and keeps it soft', () => {
    expect(b('w1d2:C')).toMatchObject({ limitMin: 12, strict: false })
  })

  it('marks a Block strict only where the workbook labels it strict', () => {
    expect(b('w2d3:C')).toMatchObject({ limitMin: 5, strict: true, limitSource: 'label' })
    expect(b('w9d2:B')).toMatchObject({ limitMin: 10, strict: true, limitSource: 'label' })
    expect(blocks.filter((x) => x.strict).map((x) => x.key)).toEqual(['base:5', 'w2d3:C', 'w9d2:B', 'final:exam'])
  })

  it('no longer treats whole Week 9-12 Blocks as strict', () => {
    for (const def of blocks.filter((x) => x.week !== null && x.week >= 9)) {
      if (def.key !== 'w9d2:B') expect(def.strict, def.key).toBe(false)
    }
  })

  it('keeps a labelled drill on a later Item at Item level, not on the Block', () => {
    expect(b('w3d5:C')).toMatchObject({ limitMin: 15, strict: false, limitSource: 'protocol' })
    expect(itemById.get('W3D5-C2')!.timing).toEqual({ minutes: 6, strict: true, kind: 'limit' })
    expect(b('w7d1:C')).toMatchObject({ limitMin: null, strict: false, limitSource: 'none' })
    expect(itemById.get('W7D1-C2')!.timing).toEqual({ minutes: 5, strict: true, kind: 'limit' })
  })

  it('gives Blocks of per-Item targets no countdown but records the targets', () => {
    expect(b('w5d1:B')).toMatchObject({ limitMin: null, limitSource: 'item-targets' })
    expect(itemById.get('W5D1-B1')!.timing).toEqual({ minutes: 6, strict: false, kind: 'target' })
    expect(itemById.get('W5D1-B2')!.timing).toEqual({ minutes: 8, strict: false, kind: 'target' })
  })

  it('falls back to the daily protocol only in Weeks 1-4', () => {
    expect(b('w2d1:B')).toMatchObject({ limitMin: 15, limitSource: 'protocol' })
    expect(b('w4d5:D')).toMatchObject({ limitMin: 10, limitSource: 'protocol' })
    expect(b('w5d2:B')).toMatchObject({ limitMin: null, limitSource: 'none' })
    expect(b('w8d3:D').limitMin).toBeNull()
  })

  it('reads challenge and mock-exam limits from the Day heading', () => {
    expect(b('w1d6:challenge')).toMatchObject({ limitMin: 60, strict: false, limitSource: 'day-heading' })
    expect(b('w10d6:challenge').limitMin).toBe(75)
    expect(b('w11d6:challenge').limitMin).toBe(75)
    expect(b('w12d5:M').limitMin).toBe(60)
    expect(b('w12d6:challenge').limitMin).toBe(90)
  })

  it('Final Examination: 85 min target, freezes at the 90 min hard limit, pace markers only', () => {
    const f = b('final:exam')
    expect(f).toMatchObject({ limitMin: 85, hardLimitMin: 90, strict: true })
    expect(freezeMin(f)).toBe(90)
    expect(f.paceMarkers.map((m) => m.atMin)).toEqual([15, 30, 45, 60, 85])
  })

  it('a non-strict Block never freezes', () => {
    expect(freezeMin(b('w1d1:A'))).toBeNull()
    expect(freezeMin(b('w2d3:C'))).toBe(5)
  })

  it('every Block records where its limit came from and Weeks 1-4 always have one', () => {
    for (const def of blocks) expect(def.limitSource, def.key).toBeTruthy()
    for (const def of blocks.filter((x) => x.week !== null && x.week <= 4 && x.day! <= 5)) {
      expect(def.limitMin, def.key).not.toBeNull()
    }
  })
})

describe('Baseline limits match the workbook Part 1 table', () => {
  const row = (name: string) => md.split('\n').find((l) => l.startsWith('|') && l.includes(name)) ?? ''
  it('sections 1-5', () => {
    expect(row('1. Pattern')).toContain('20 min (soft)')
    expect(row('2. Working memory')).toContain('~20 min')
    expect(row('3. Abstraction')).toContain('25 min (soft)')
    expect(row('4. Hypothesis testing')).toContain('30 min (soft)')
    expect(row('5. Processing')).toContain('12 min strict')
    expect(b('base:1')).toMatchObject({ limitMin: 20, strict: false })
    expect(b('base:2')).toMatchObject({ limitMin: 20, strict: false })
    expect(b('base:3')).toMatchObject({ limitMin: 25, strict: false })
    expect(b('base:4')).toMatchObject({ limitMin: 30, strict: false })
    expect(b('base:5')).toMatchObject({ limitMin: 12, strict: true })
  })
})
