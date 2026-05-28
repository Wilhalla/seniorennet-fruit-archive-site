import postsData from '../data/posts.json'
import postSeriesData from '../data/post-series.json'
import { buildArchiveSeries, type ArchiveSeriesDetail, type ArchiveSeriesRecord } from './archiveSeries'
import type { PostSummary } from './postIndex'

export type Reaction = {
  id: string
  title: string
  date: string
  isoDate: string
  time: string
  author: string
  html: string
}

export type Post = PostSummary & {
  html: string
  images: string[]
  reactions: Reaction[]
}

export type PostSeriesDetail = ArchiveSeriesDetail<Post>

type PostSeriesRecord = ArchiveSeriesRecord

export const posts = postsData as Post[]

const seriesRecords = (postSeriesData as { series: PostSeriesRecord[] }).series
const archiveSeries = buildArchiveSeries(posts, seriesRecords)

export function getPost(slug: string) {
  return posts.find((post) => post.slug === slug)
}

export function getSeriesForPost(postId: string): PostSeriesDetail | undefined {
  return archiveSeries.getSeriesForPost(postId)
}

export function aggregateSeriesPost(series: PostSeriesDetail): Post {
  return archiveSeries.aggregateSeriesPost(series)
}
