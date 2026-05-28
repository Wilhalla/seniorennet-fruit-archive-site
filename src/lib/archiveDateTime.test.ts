import { describe, expect, it } from 'vitest'
import { archiveDayLabel, archiveMonthKey, archiveTimestamp, archiveYear, displayArchiveYear, formatArchiveDate, parseSeniorennetDateTime, seasonForMonth, sortArchiveChronologically } from './archiveDateTime'

describe('archive datetime', () => {
  it('normalizes Seniorennet date and time into an ISO datetime', () => {
    expect(parseSeniorennetDateTime('07-03-2008', '09:05')).toBe('2008-03-07T09:05:00')
    expect(parseSeniorennetDateTime('07-03-2008')).toBe('2008-03-07')
    expect(parseSeniorennetDateTime('bad date', '09:05')).toBe('')
  })

  it('exposes archive year, month key, day label, display date, and season with invalid-date fallbacks', () => {
    const post = { date: '07-03-2008', isoDate: '2008-03-07T09:05:00' }

    expect(archiveYear(post)).toBe('2008')
    expect(archiveMonthKey(post)).toBe('m-2008-03')
    expect(archiveDayLabel(post)).toBe('07')
    expect(formatArchiveDate(post)).toBe('07 maart 2008')
    expect(seasonForMonth(3)).toBe('lente')
    expect(seasonForMonth(null)).toBe('winter')

    const invalid = { date: 'zonder datum', isoDate: '' }
    expect(archiveYear(invalid)).toBe('ongedateerd')
    expect(archiveMonthKey(invalid)).toBe('m-ongedateerd')
    expect(archiveDayLabel(invalid)).toBe('—')
    expect(formatArchiveDate(invalid)).toBe('zonder datum')
    expect(displayArchiveYear('ongedateerd')).toBe('Geen datum')
  })

  it('sorts valid archive datetimes newest first and invalid datetimes last by title', () => {
    const posts = [
      { title: 'B', isoDate: '' },
      { title: 'Older', isoDate: '2006-01-01T00:00:00' },
      { title: 'Newer', isoDate: '2007-01-01T00:00:00' },
      { title: 'A', isoDate: '' },
    ]

    expect(sortArchiveChronologically(posts).map((post) => post.title)).toEqual(['Newer', 'Older', 'A', 'B'])
    expect(archiveTimestamp(posts[0])).toBe(Number.POSITIVE_INFINITY)
  })
})
