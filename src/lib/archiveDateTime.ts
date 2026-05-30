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

export type ArchiveDatetimeInput = {
  isoDate?: string
  date?: string
  title?: string
}

export type ArchiveYearGroup<T> = {
  year: string
  items: T[]
  count: number
  firstIndex: number
  firstMonthKey: string
}

export type ArchiveMonthGroup<T> = {
  key: string
  label: string
  shortLabel: string
  year: string
  items: T[]
  count: number
  startsYear: boolean
}

export type ArchiveChronology<T> = {
  chronologicalItems: T[]
  yearGroups: ArchiveYearGroup<T>[]
  monthGroups: ArchiveMonthGroup<T>[]
}

export function parseSeniorennetDateTime(date = '', time = '') {
  const match = date.match(/(\d{2})-(\d{2})-(\d{4})/)
  if (!match) return ''
  const [, dd, mm, yyyy] = match
  return `${yyyy}-${mm}-${dd}${time ? `T${time}:00` : ''}`
}

function archiveDateValue(value: string | ArchiveDatetimeInput) {
  return typeof value === 'string' ? value : value.isoDate || value.date || ''
}

export function archiveDate(value: string | ArchiveDatetimeInput) {
  const date = new Date(archiveDateValue(value))
  return Number.isNaN(date.valueOf()) ? null : date
}

export function archiveTimestamp(value: string | ArchiveDatetimeInput) {
  return archiveDate(value)?.valueOf() ?? Number.POSITIVE_INFINITY
}

export function archiveYear(value: string | ArchiveDatetimeInput) {
  return archiveDate(value) ? archiveDateValue(value).slice(0, 4) : 'ongedateerd'
}

export function displayArchiveYear(year: string) {
  return year === 'unknown' || year === 'ongedateerd' ? 'Geen datum' : year
}

export function archiveMonthKey(value: string | ArchiveDatetimeInput) {
  const date = archiveDate(value)
  return date ? `m-${archiveDateValue(value).slice(0, 7)}` : `m-${archiveYear(value)}`
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

export function sortArchiveChronologically<T extends ArchiveDatetimeInput>(items: readonly T[]) {
  return [...items].sort((a, b) => {
    const aTime = archiveTimestamp(a)
    const bTime = archiveTimestamp(b)
    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return collator.compare(a.title ?? '', b.title ?? '')
    if (!Number.isFinite(aTime)) return 1
    if (!Number.isFinite(bTime)) return -1
    return bTime - aTime || collator.compare(a.title ?? '', b.title ?? '')
  })
}

export function buildArchiveChronology<T extends ArchiveDatetimeInput>(items: readonly T[], options: { limit?: number; sort?: boolean } = {}): ArchiveChronology<T> {
  const sortedItems = options.sort === false ? [...items] : sortArchiveChronologically(items)
  const chronologicalItems = typeof options.limit === 'number' ? sortedItems.slice(0, options.limit) : sortedItems
  const yearMap = new Map<string, ArchiveYearGroup<T>>()
  const monthMap = new Map<string, ArchiveMonthGroup<T>>()
  const yearGroups: ArchiveYearGroup<T>[] = []
  const monthGroups: ArchiveMonthGroup<T>[] = []

  chronologicalItems.forEach((item, index) => {
    const year = archiveYear(item)
    const key = archiveMonthKey(item)
    let yearGroup = yearMap.get(year)
    if (!yearGroup) {
      yearGroup = { year, items: [], count: 0, firstIndex: index, firstMonthKey: key }
      yearMap.set(year, yearGroup)
      yearGroups.push(yearGroup)
    }
    yearGroup.items.push(item)
    yearGroup.count += 1

    let monthGroup = monthMap.get(key)
    if (!monthGroup) {
      monthGroup = {
        key,
        year,
        label: archiveMonthLabel(key),
        shortLabel: archiveShortMonthLabel(item),
        items: [],
        count: 0,
        startsYear: yearGroup.count === 1,
      }
      monthMap.set(key, monthGroup)
      monthGroups.push(monthGroup)
    }
    monthGroup.items.push(item)
    monthGroup.count += 1
  })

  return { chronologicalItems, yearGroups, monthGroups }
}
