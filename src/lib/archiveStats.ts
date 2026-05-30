import generatedPostsData from '../data/generated/posts-index.json'
import postIndexData from '../data/post-index.json'
import topicsData from '../data/generated/topics.json'
import topicCalendarData from '../data/generated/topic-calendar.json'

import type { ArchiveStatsData, CalendarBurst, HeatmapCell, RankPost, StatsPost, TopicCalendarData, TopicStat, YearStat } from './archiveStatsTypes'
export type { ArchiveStatsData, CalendarBurst, DistributionBucket, HeatmapCell, MonthStat, RankPost, StatsPost, TopicCalendarData, TopicStat, WeekdayStat, YearStat } from './archiveStatsTypes'

type GeneratedPost = {
  id: string | number
  slug: string
  title: string
  date: string
  isoDate: string
  year: number
  month: number
  excerpt?: string
  cleanedText?: string
  imageCount?: number
  topicId?: string
  url?: string
}

type IndexedPost = {
  id: string | number
  reactionCount?: number
  imageCount?: number
}

type TopicRecord = {
  id: string
  label?: string
  generatedLabel?: string
}

const MONTH_LABELS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const WEEKDAY_LABELS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const MS_PER_DAY = 86_400_000

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function authorText(text: string) {
  return normalizeWhitespace(text)
    .split(/\bReacties\b\s+\d{2}[-/]\d{2}[-/]\d{4}/i)[0]
    .split(/\bComments\b\s+\d{2}[-/]\d{2}[-/]\d{4}/i)[0]
    .replace(/\b(outlet|shoes|nike|jordan|kors|coach|sunglasses|replica|cheap|wholesale)\b[\s\S]*$/i, '')
    .trim()
}

function countWords(text: string) {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)
  return words?.length ?? 0
}

function percentile(sortedValues: number[], p: number) {
  if (!sortedValues.length) return 0
  const index = Math.ceil((p / 100) * sortedValues.length) - 1
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)] ?? 0
}

function toIsoDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / MS_PER_DAY)
}

function formatDateLabel(date: string) {
  return new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00`))
}

function emptyYearStat(year: number): YearStat {
  return {
    year,
    posts: 0,
    images: 0,
    reactions: 0,
    words: 0,
    chars: 0,
    activeDays: 0,
    activeMonths: 0,
    avgChars: 0,
    avgImages: 0,
    avgReactions: 0,
  }
}

function rankPost(post: StatsPost): RankPost {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    url: post.url,
    date: post.date,
    year: post.year,
    charCount: post.charCount,
    wordCount: post.wordCount,
    imageCount: post.imageCount,
    reactionCount: post.reactionCount,
    topicLabel: post.topicLabel,
  }
}

function bucketCount(posts: StatsPost[], buckets: Array<{ label: string; test: (post: StatsPost) => boolean }>) {
  return buckets.map((bucket) => ({
    label: bucket.label,
    posts: posts.filter(bucket.test).length,
  }))
}

function buildPosts(): StatsPost[] {
  const reactionsById = new Map(
    (postIndexData as IndexedPost[]).map((post) => [String(post.id), post.reactionCount ?? 0])
  )
  const fallbackImageCountById = new Map(
    (postIndexData as IndexedPost[]).map((post) => [String(post.id), post.imageCount ?? 0])
  )
  const topicLabelById = new Map(
    (topicsData as TopicRecord[]).map((topic) => [topic.id, topic.label || topic.generatedLabel || topic.id])
  )

  return (generatedPostsData as GeneratedPost[]).map((post) => {
    const text = authorText(post.cleanedText || post.excerpt || post.title)
    const date = new Date(post.isoDate)
    const day = post.isoDate.slice(0, 10)
    const topicId = post.topicId || 'unknown'
    return {
      id: String(post.id),
      slug: post.slug,
      title: post.title,
      url: post.url || `/posts/${post.slug}/`,
      date: post.date,
      isoDate: post.isoDate,
      year: post.year,
      month: post.month,
      day,
      weekday: date.getDay(),
      hour: date.getHours(),
      excerpt: post.excerpt || '',
      charCount: text.length,
      wordCount: countWords(text),
      imageCount: post.imageCount ?? fallbackImageCountById.get(String(post.id)) ?? 0,
      reactionCount: reactionsById.get(String(post.id)) ?? 0,
      topicId,
      topicLabel: topicLabelById.get(topicId) || 'Onbenoemd thema',
    }
  })
}

export function buildArchiveStatsData(): ArchiveStatsData {
  const posts = buildPosts()
  const orderedAscending = [...posts].sort((a, b) => a.isoDate.localeCompare(b.isoDate))
  const orderedDays = Array.from(new Set(orderedAscending.map((post) => post.day))).sort()
  const totalImages = posts.reduce((sum, post) => sum + post.imageCount, 0)
  const totalReactions = posts.reduce((sum, post) => sum + post.reactionCount, 0)
  const totalWords = posts.reduce((sum, post) => sum + post.wordCount, 0)
  const totalChars = posts.reduce((sum, post) => sum + post.charCount, 0)
  const sortedChars = posts.map((post) => post.charCount).sort((a, b) => a - b)
  const firstDay = orderedDays[0] || ''
  const lastDay = orderedDays.at(-1) || ''

  const yearMap = new Map<number, YearStat>()
  const yearDays = new Map<number, Set<string>>()
  const yearMonths = new Map<number, Set<number>>()
  for (const post of posts) {
    const stat = yearMap.get(post.year) || emptyYearStat(post.year)
    stat.posts += 1
    stat.images += post.imageCount
    stat.reactions += post.reactionCount
    stat.words += post.wordCount
    stat.chars += post.charCount
    yearMap.set(post.year, stat)
    if (!yearDays.has(post.year)) yearDays.set(post.year, new Set())
    if (!yearMonths.has(post.year)) yearMonths.set(post.year, new Set())
    yearDays.get(post.year)?.add(post.day)
    yearMonths.get(post.year)?.add(post.month)
  }

  const byYear = Array.from(yearMap.values())
    .sort((a, b) => a.year - b.year)
    .map((stat) => {
      const activeDays = yearDays.get(stat.year)?.size ?? 0
      const activeMonths = yearMonths.get(stat.year)?.size ?? 0
      return {
        ...stat,
        activeDays,
        activeMonths,
        avgChars: Math.round(stat.chars / stat.posts),
        avgImages: Number((stat.images / stat.posts).toFixed(2)),
        avgReactions: Number((stat.reactions / stat.posts).toFixed(2)),
      }
    })

  const byMonth = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    label: MONTH_LABELS[index] ?? String(index + 1),
    posts: 0,
    images: 0,
    reactions: 0,
  }))
  for (const post of posts) {
    const month = byMonth[post.month - 1]
    if (!month) continue
    month.posts += 1
    month.images += post.imageCount
    month.reactions += post.reactionCount
  }

  const byWeekday = WEEKDAY_LABELS.map((label, day) => ({ day, label, posts: 0 }))
  for (const post of posts) {
    const weekday = byWeekday[post.weekday]
    if (weekday) weekday.posts += 1
  }

  const heatmap = new Map<string, HeatmapCell>()
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      heatmap.set(`${day}-${hour}`, { day, hour, posts: 0 })
    }
  }
  for (const post of posts) {
    if (post.hour === 0) continue
    const key = `${post.weekday}-${post.hour}`
    const cell = heatmap.get(key)
    if (cell) cell.posts += 1
  }

  const topicMap = new Map<string, TopicStat>()
  for (const post of posts) {
    const stat = topicMap.get(post.topicId) || {
      id: post.topicId,
      label: post.topicLabel,
      posts: 0,
      images: 0,
      reactions: 0,
      words: 0,
      avgWords: 0,
      illustratedShare: 0,
    }
    stat.posts += 1
    stat.images += post.imageCount
    stat.reactions += post.reactionCount
    stat.words += post.wordCount
    topicMap.set(post.topicId, stat)
  }
  const topics = Array.from(topicMap.values())
    .map((topic) => ({
      ...topic,
      avgWords: Math.round(topic.words / topic.posts),
      illustratedShare: Number((topic.images / topic.posts).toFixed(2)),
    }))
    .sort((a, b) => b.posts - a.posts)
    .slice(0, 14)

  let longestStreak = { start: firstDay, end: firstDay, days: orderedDays.length ? 1 : 0 }
  let currentStreak = { start: firstDay, end: firstDay, days: orderedDays.length ? 1 : 0 }
  let longestGap = { start: firstDay, end: firstDay, days: 0 }
  for (let index = 1; index < orderedDays.length; index += 1) {
    const previous = orderedDays[index - 1] ?? ''
    const current = orderedDays[index] ?? ''
    const gap = daysBetween(previous, current)
    if (gap === 1) {
      currentStreak.end = current
      currentStreak.days += 1
    } else {
      if (currentStreak.days > longestStreak.days) longestStreak = { ...currentStreak }
      currentStreak = { start: current, end: current, days: 1 }
      if (gap - 1 > longestGap.days) {
        const gapStart = new Date(`${previous}T00:00:00`)
        gapStart.setDate(gapStart.getDate() + 1)
        const gapEnd = new Date(`${current}T00:00:00`)
        gapEnd.setDate(gapEnd.getDate() - 1)
        longestGap = { start: toIsoDay(gapStart), end: toIsoDay(gapEnd), days: gap - 1 }
      }
    }
  }
  if (currentStreak.days > longestStreak.days) longestStreak = { ...currentStreak }

  const dayMap = new Map<string, CalendarBurst>()
  for (const post of posts) {
    const stat = dayMap.get(post.day) || {
      date: post.day,
      label: formatDateLabel(post.day),
      posts: 0,
      images: 0,
      reactions: 0,
    }
    stat.posts += 1
    stat.images += post.imageCount
    stat.reactions += post.reactionCount
    dayMap.set(post.day, stat)
  }

  const byLongest = [...posts].sort((a, b) => b.charCount - a.charCount)
  const byImages = [...posts].sort((a, b) => b.imageCount - a.imageCount || b.charCount - a.charCount)
  const byReactions = [...posts].sort((a, b) => b.reactionCount - a.reactionCount || b.charCount - a.charCount)
  const quietLongreads = [...posts]
    .filter((post) => post.reactionCount === 0 && post.charCount >= percentile(sortedChars, 80))
    .sort((a, b) => b.charCount - a.charCount)

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      posts: posts.length,
      images: totalImages,
      reactions: totalReactions,
      words: totalWords,
      chars: totalChars,
      activeDays: orderedDays.length,
      activeYears: byYear.length,
      firstDate: firstDay,
      lastDate: lastDay,
      firstYear: byYear[0]?.year ?? 0,
      lastYear: byYear.at(-1)?.year ?? 0,
      illustratedPosts: posts.filter((post) => post.imageCount > 0).length,
      reactedPosts: posts.filter((post) => post.reactionCount > 0).length,
      medianChars: percentile(sortedChars, 50),
      p95Chars: percentile(sortedChars, 95),
      avgDaysBetweenActiveDays: orderedDays.length > 1 ? Number((daysBetween(firstDay, lastDay) / (orderedDays.length - 1)).toFixed(1)) : 0,
    },
    byYear,
    byMonth,
    byWeekday,
    weekdayHour: Array.from(heatmap.values()),
    distributions: {
      length: bucketCount(posts, [
        { label: '< 500', test: (post) => post.charCount < 500 },
        { label: '500–1k', test: (post) => post.charCount >= 500 && post.charCount < 1000 },
        { label: '1k–2k', test: (post) => post.charCount >= 1000 && post.charCount < 2000 },
        { label: '2k–4k', test: (post) => post.charCount >= 2000 && post.charCount < 4000 },
        { label: '4k+', test: (post) => post.charCount >= 4000 },
      ]),
      images: bucketCount(posts, [
        { label: '0', test: (post) => post.imageCount === 0 },
        { label: '1', test: (post) => post.imageCount === 1 },
        { label: '2–3', test: (post) => post.imageCount >= 2 && post.imageCount <= 3 },
        { label: '4–7', test: (post) => post.imageCount >= 4 && post.imageCount <= 7 },
        { label: '8+', test: (post) => post.imageCount >= 8 },
      ]),
      reactions: bucketCount(posts, [
        { label: '0', test: (post) => post.reactionCount === 0 },
        { label: '1', test: (post) => post.reactionCount === 1 },
        { label: '2–3', test: (post) => post.reactionCount >= 2 && post.reactionCount <= 3 },
        { label: '4–7', test: (post) => post.reactionCount >= 4 && post.reactionCount <= 7 },
        { label: '8+', test: (post) => post.reactionCount >= 8 },
      ]),
    },
    topics,
    top: {
      longest: byLongest.slice(0, 10).map(rankPost),
      imageRich: byImages.slice(0, 10).map(rankPost),
      mostDiscussed: byReactions.slice(0, 10).map(rankPost),
      quietLongreads: quietLongreads.slice(0, 10).map(rankPost),
    },
    consistency: {
      longestStreak,
      longestGap,
      busiestDays: Array.from(dayMap.values())
        .sort((a, b) => b.posts - a.posts || b.images - a.images)
        .slice(0, 8),
    },
    topicCalendar: topicCalendarData as TopicCalendarData,
  }
}
