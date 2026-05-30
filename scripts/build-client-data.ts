import fs from 'node:fs/promises'
import path from 'node:path'
import postIndexData from '../src/data/post-index.json' with { type: 'json' }
import postSeriesData from '../src/data/post-series.json' with { type: 'json' }
import mapPointsData from '../src/data/generated/map-points.json' with { type: 'json' }
import topicsData from '../src/data/generated/topics.json' with { type: 'json' }
import { buildArchiveSeries } from '../src/lib/archiveSeries.ts'
import { sortArchiveChronologically } from '../src/lib/archiveDateTime.ts'

type PostSummary = {
  id: string
  slug: string
  title: string
  date: string
  isoDate: string
  imageCount: number
  reactionCount: number
  images?: string[]
  isSeries?: boolean
  seriesId?: string
  seriesPostIds?: string[]
  seriesPostCount?: number
}

type ArchiveClientPost = Pick<PostSummary, 'id' | 'slug' | 'title' | 'date' | 'isoDate' | 'imageCount' | 'reactionCount' | 'isSeries' | 'seriesPostCount'> & {
  topicIds: string[]
}

type MapPoint = {
  id: string
  topicId?: string
}

type TopicRecord = {
  id: string
  label?: string
  generatedLabel?: string
  postCount?: number
}

const ROOT = process.cwd()
const OUT_DIRS = [path.join(ROOT, 'public/generated'), path.join(ROOT, 'src/data/generated')]
const postIndex = postIndexData as PostSummary[]
const postSeries = (postSeriesData as { series: Array<{ id: string; title: string; primaryPostId: string; postIds: string[]; postCount: number }> }).series
const mapPoints = mapPointsData as MapPoint[]
const topics = topicsData as TopicRecord[]
const archiveSeries = buildArchiveSeries(postIndex, postSeries)
const topicIdByPostId = new Map(mapPoints.map((point) => [point.id, point.topicId || '']))

function topicIdsFor(post: PostSummary) {
  const postIds = post.seriesPostIds?.length ? post.seriesPostIds : [post.id]
  return Array.from(new Set(postIds.map((postId) => topicIdByPostId.get(postId)).filter((topicId): topicId is string => Boolean(topicId)))).sort()
}

function slim(post: PostSummary): ArchiveClientPost {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    date: post.date,
    isoDate: post.isoDate,
    imageCount: post.imageCount,
    reactionCount: post.reactionCount,
    isSeries: post.isSeries || undefined,
    seriesPostCount: post.seriesPostCount || undefined,
    topicIds: topicIdsFor(post),
  }
}

const payload = {
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  topics: topics.map((topic) => ({
    id: topic.id,
    label: topic.label || '',
    generatedLabel: topic.generatedLabel || '',
    postCount: topic.postCount || 0,
  })),
  aggregated: sortArchiveChronologically(archiveSeries.aggregated).map(slim),
  all: sortArchiveChronologically(archiveSeries.all).map(slim),
}

for (const outDir of OUT_DIRS) {
  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(path.join(outDir, 'archive-posts.client.json'), `${JSON.stringify(payload)}\n`, 'utf8')
}

console.log(`[client-data] wrote archive client index: ${payload.aggregated.length} aggregated, ${payload.all.length} all`)
