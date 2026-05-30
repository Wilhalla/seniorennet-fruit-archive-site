import {
  aggregatedPostIndex,
  archiveStats,
  postIndex,
  postSeries,
  type PostSummary,
} from './archivePostReading'
import { formatArchiveDate } from './archiveDateTime'

export { aggregatedPostIndex, archiveStats, postIndex, postSeries, type PostSummary }
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
