import postIndexData from '../data/post-index.json'
import postSeriesData from '../data/post-series.json'
import { buildArchiveSeries, type ArchiveSeriesRecord } from './archiveSeries'
import { formatArchiveDate } from './archiveDateTime'

export type PostSummary = {
  id: string
  blog: 'fruit' | 'fruit2'
  slug: string
  title: string
  date: string
  isoDate: string
  time: string
  author: string
  excerpt: string
  images: string[]
  imageCount: number
  reactionCount: number
  sourcePath: string
  isSeries?: boolean
  seriesId?: string
  seriesPostIds?: string[]
  seriesPostCount?: number
}

type PostSeries = ArchiveSeriesRecord & {
  postCount: number
  imageCount: number
  reactionCount: number
  source: string
}

export const postIndex = postIndexData as PostSummary[]
export const postSeries = (postSeriesData as { series: PostSeries[] }).series

const archiveSeries = buildArchiveSeries(postIndex, postSeries)

export const aggregatedPostIndex: PostSummary[] = archiveSeries.aggregated
export const archiveStats = archiveSeries.stats
export const formatDate = formatArchiveDate

export function featuredImages(limit: number) {
  const seen = new Set<string>()
  const images: Array<{ src: string; title: string; slug: string }> = []
  for (const post of postIndex) {
    for (const src of post.images) {
      if (seen.has(src)) continue
      seen.add(src)
      images.push({ src, title: post.title, slug: post.slug })
      if (images.length >= limit) return images
    }
  }
  return images
}
