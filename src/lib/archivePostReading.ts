import postsData from '../data/posts.json'
import postIndexData from '../data/post-index.json'
import postSeriesData from '../data/post-series.json'
import { buildArchiveSeries, type ArchiveSeriesDetail, type ArchiveSeriesRecord } from './archiveSeries'
import { postGalleryImageEntries, type PostGalleryImageEntry } from './galleryImageLinks'
import { stripDuplicateTitleFromArchiveHtml } from './archivePostHtml'

export type Reaction = {
  id: string
  title: string
  date: string
  isoDate: string
  time: string
  author: string
  html: string
}

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

export type Post = PostSummary & {
  html: string
  images: string[]
  reactions: Reaction[]
}

type PostSeries = ArchiveSeriesRecord & {
  postCount: number
  imageCount: number
  reactionCount: number
  source: string
}

export type PostSeriesDetail = ArchiveSeriesDetail<Post>
export type PostSeriesRecord = ArchiveSeriesRecord

export const posts = postsData as Post[]
export const postIndex = postIndexData as PostSummary[]
export const postSeries = (postSeriesData as { series: PostSeries[] }).series

const archivePostIndexSeries = buildArchiveSeries(postIndex, postSeries)
const archivePostDetailSeries = buildArchiveSeries(posts, postSeries)

export const aggregatedPostIndex: PostSummary[] = archivePostIndexSeries.aggregated
export const archiveStats = archivePostIndexSeries.stats

export const archivePostSidebarImageSizes = [
  '(max-width: 1023px) calc(100vw - 2rem)',
  '(min-width: 1280px) 14rem',
  '12rem',
].join(', ')

export const archivePostSidebarThumbSizes = [
  '(max-width: 767px) calc((100vw - 2.5rem) / 2)',
  '(max-width: 1023px) calc((100vw - 3.5rem) / 3)',
  '(min-width: 1280px) 6.5rem',
  '7rem',
].join(', ')

export function getPost(slug: string) {
  return posts.find((post) => post.slug === slug)
}

export function getSeriesForPost(postId: string): PostSeriesDetail | undefined {
  return archivePostDetailSeries.getSeriesForPost(postId)
}

export function aggregateSeriesPost(series: PostSeriesDetail): Post {
  return archivePostDetailSeries.aggregateSeriesPost(series)
}

export function archivePostPartLabel(index: number, total: number) {
  return total > 1 ? `Deel ${index + 1} van ${total}` : 'Bericht'
}

export function archivePostPartHtml(part: Pick<Post, 'html' | 'title'>) {
  return stripDuplicateTitleFromArchiveHtml(part.html, part.title)
}

export type ArchivePostReading = {
  requestedPost: Post
  displayPost: Post
  series: PostSeriesDetail | undefined
  isSeries: boolean
  parts: Post[]
  currentPostId: string
  imageEntries: PostGalleryImageEntry[]
  hasImages: boolean
}

export function buildArchivePostReading(slug: string): ArchivePostReading | undefined {
  const requestedPost = getPost(slug)
  if (!requestedPost) return undefined

  const series = getSeriesForPost(requestedPost.id)
  const displayPost = series ? aggregateSeriesPost(series) : requestedPost
  const isSeries = Boolean(series?.posts.length && series.posts.length > 1)
  const parts = isSeries ? series!.posts : [displayPost]
  const imageEntries = postGalleryImageEntries(parts)
  return {
    requestedPost,
    displayPost,
    series,
    isSeries,
    parts,
    currentPostId: requestedPost.id,
    imageEntries,
    hasImages: imageEntries.length > 0,
  }
}
