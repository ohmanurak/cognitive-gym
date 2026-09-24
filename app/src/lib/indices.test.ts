import { describe, expect, it } from 'vitest'
import { calibration, efficiency, efficiencyCounts, patternIndex, rubricIndex, workingMemoryIndex } from './indices'

describe('indices (Workbook §0.8)', () => {
  it('PI rewards speed only when accuracy ≥ 75%', () => {
    expect(patternIndex(80, 10, 10)).toBeCloseTo(80)
    expect(patternIndex(80, 10, 20)).toBeCloseTo(80 * (0.7 + 0.15))
    expect(patternIndex(70, 10, 5)).toBeCloseTo(70 * 0.7)
  })

  it('AI/HI is mean rubric score as a percentage', () => {
    expect(rubricIndex([8, 6])).toBe(70)
    expect(rubricIndex([])).toBeNull()
  })

  it('WMI weights span 20%, manipulation 40%, multi-step 40%', () => {
    expect(workingMemoryIndex(8, 1, 1)).toBeCloseTo(100)
    expect(workingMemoryIndex(4, 0.5, 0.5)).toBeCloseTo(100 * (0.1 + 0.2 + 0.2))
    expect(workingMemoryIndex(12, 0, 0)).toBeCloseTo(20)
  })

  it('efficiency is correct per minute', () => {
    expect(efficiency(9, 12)).toBeCloseTo(0.75)
    expect(efficiency(9, 0)).toBeNull()
  })

  it('efficiency gains need accuracy ≥ 75% and within 5 pts of baseline', () => {
    expect(efficiencyCounts(80, 82)).toBe(true)
    expect(efficiencyCounts(74, 74)).toBe(false)
    expect(efficiencyCounts(78, 90)).toBe(false)
  })

  it('calibration buckets accuracy by confidence', () => {
    const c = calibration([
      { confidence: 5, correct: true },
      { confidence: 5, correct: false },
      { confidence: 2, correct: true },
    ])
    expect(c[4]).toEqual({ confidence: 5, n: 2, accuracy: 0.5 })
    expect(c[1].accuracy).toBe(1)
    expect(c[0].accuracy).toBeNull()
  })
})
