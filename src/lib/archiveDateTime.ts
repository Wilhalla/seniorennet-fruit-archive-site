const archiveDateFormatter = new Intl.DateTimeFormat('nl-BE', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})
const archiveMonthFormatter = new Intl.DateTimeFormat('nl-BE', {
  month: 'long',
  year: 'numeric',
})
const archiveShortMonthFormatter = new Intl.DateTimeFormat('nl-BE', {
  month: 'short',
})
const archiveDayFormatter = new Intl.DateTimeFormat('nl-BE', { day: '2-digit' })
const collator = new Intl.Collator('nl-BE')

export type ArchiveDatetimeInput = Pick<{ date: string; isoDate: string; title: string }, 'isoDate'> & Partial<Pick<{ date: string; title: string }, 'date' | 'title'>>

export function parseSeniorennetDateTime(date = '', time = '') {
  const match = date.match(/(\d{2})-(\d{2})-(\d{4})/)
  if (!match) return ''
  const [, dd, mm, yyyy] = match
  return `${yyyy}-${mm}-${dd}${time ? `T${time}:00` : ''}`
}

export function archiveDate(value: string | ArchiveDatetimeInput) {
  const isoDate = typeof value === 'string' ? value : value.isoDate
  const date = new Date(isoDate)
  return Number.isNaN(date.valueOf()) ? null : date
}

export function archiveTimestamp(value: string | ArchiveDatetimeInput) {
  return archiveDate(value)?.valueOf() ?? Number.POSITIVE_INFINITY
}

export function archiveYear(value: string | ArchiveDatetimeInput) {
  const isoDate = typeof value === 'string' ? value : value.isoDate
  return isoDate?.slice(0, 4) || 'ongedateerd'
}

export function displayArchiveYear(year: string) {
  return year === 'unknown' || year === 'ongedateerd' ? 'Geen datum' : year
}

export function archiveMonthKey(value: string | ArchiveDatetimeInput) {
  const date = archiveDate(value)
  return date ? `m-${(typeof value === 'string' ? value : value.isoDate).slice(0, 7)}` : `m-${archiveYear(value)}`
}

export function archiveMonthLabel(monthKey: string) {
  const raw = monthKey.replace(/^m-/, '')
  const date = new Date(`${raw}-01T00:00:00`)
  return Number.isNaN(date.valueOf()) ? 'Datum onbekend' : archiveMonthFormatter.format(date)
}

export function archiveShortMonthLabel(value: string | ArchiveDatetimeInput) {
  const date = archiveDate(value)
  return date ? archiveShortMonthFormatter.format(date).replace('.', '') : '—'
}

export function archiveDayLabel(value: string | ArchiveDatetimeInput) {
  const date = archiveDate(value)
  return date ? archiveDayFormatter.format(date) : '—'
}

export function formatArchiveDate(post: ArchiveDatetimeInput) {
  const date = archiveDate(post)
  if (!date) return post.date ?? post.isoDate
  return archiveDateFormatter.format(date)
}

export function seasonForMonth(month: number | null | undefined) {
  if (month === 3 || month === 4 || month === 5) return 'lente'
  if (month === 6 || month === 7 || month === 8) return 'zomer'
  if (month === 9 || month === 10 || month === 11) return 'herfst'
  return 'winter'
}

export function sortArchiveChronologically<T extends ArchiveDatetimeInput>(posts: readonly T[]) {
  return [...posts].sort((a, b) => {
    const aTime = archiveTimestamp(a)
    const bTime = archiveTimestamp(b)
    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return collator.compare(a.title ?? '', b.title ?? '')
    if (!Number.isFinite(aTime)) return 1
    if (!Number.isFinite(bTime)) return -1
    return bTime - aTime || collator.compare(a.title ?? '', b.title ?? '')
  })
}
