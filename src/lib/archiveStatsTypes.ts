export type StatsPost = {
  id: string
  slug: string
  title: string
  url: string
  date: string
  isoDate: string
  year: number
  month: number
  day: string
  weekday: number
  hour: number
  excerpt: string
  charCount: number
  wordCount: number
  imageCount: number
  reactionCount: number
  topicId: string
  topicLabel: string
}

export type RankPost = Pick<
  StatsPost,
  | 'id'
  | 'slug'
  | 'title'
  | 'url'
  | 'date'
  | 'year'
  | 'charCount'
  | 'wordCount'
  | 'imageCount'
  | 'reactionCount'
  | 'topicLabel'
>

export type YearStat = {
  year: number
  posts: number
  images: number
  reactions: number
  words: number
  chars: number
  activeDays: number
  activeMonths: number
  avgChars: number
  avgImages: number
  avgReactions: number
}

export type MonthStat = {
  month: number
  label: string
  posts: number
  images: number
  reactions: number
}

export type DistributionBucket = {
  label: string
  posts: number
}

export type TopicStat = {
  id: string
  label: string
  posts: number
  images: number
  reactions: number
  words: number
  avgWords: number
  illustratedShare: number
}

export type HeatmapCell = {
  day: number
  hour: number
  posts: number
}

export type WeekdayStat = {
  day: number
  label: string
  posts: number
}

export type CalendarBurst = {
  date: string
  label: string
  posts: number
  images: number
  reactions: number
}

export type TopicCalendarRow = {
  topicId: string
  label: string
  generatedLabel: string
  postCount: number
  monthsAllYears: number[]
}

export type TopicCalendarData = {
  maxMonthCount: number
  topics: TopicCalendarRow[]
}

export type ArchiveStatsData = {
  generatedAt: string
  totals: {
    posts: number
    images: number
    reactions: number
    words: number
    chars: number
    activeDays: number
    activeYears: number
    firstDate: string
    lastDate: string
    firstYear: number
    lastYear: number
    illustratedPosts: number
    reactedPosts: number
    medianChars: number
    p95Chars: number
    avgDaysBetweenActiveDays: number
  }
  byYear: YearStat[]
  byMonth: MonthStat[]
  byWeekday: WeekdayStat[]
  weekdayHour: HeatmapCell[]
  distributions: {
    length: DistributionBucket[]
    images: DistributionBucket[]
    reactions: DistributionBucket[]
  }
  topics: TopicStat[]
  top: {
    longest: RankPost[]
    imageRich: RankPost[]
    mostDiscussed: RankPost[]
    quietLongreads: RankPost[]
  }
  consistency: {
    longestStreak: { start: string; end: string; days: number }
    longestGap: { start: string; end: string; days: number }
    busiestDays: CalendarBurst[]
  }
  topicCalendar: TopicCalendarData
}

