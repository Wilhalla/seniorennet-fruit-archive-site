import { describe, expect, it } from 'vitest'
import { activeYearFromVirtualItems } from './activeVirtualYear'

describe('activeYearFromVirtualItems', () => {
  const rows = [
    { year: '2020' },
    { year: '2020' },
    { year: '2020' },
    { year: '2019' },
    { year: '2019' },
  ]

  it('uses the first row crossing the active viewport line instead of the first overscanned row', () => {
    const virtualItems = [
      { index: 0, start: 0, size: 104 },
      { index: 1, start: 104, size: 220 },
      { index: 2, start: 324, size: 220 },
      { index: 3, start: 544, size: 104 },
      { index: 4, start: 648, size: 74 },
    ]

    expect(activeYearFromVirtualItems(rows, virtualItems, (row) => row.year, 560)).toBe('2019')
  })

  it('falls back to the first entry when no virtual items are mounted yet', () => {
    expect(activeYearFromVirtualItems(rows, [], (row) => row.year, 0)).toBe('2020')
  })
})
