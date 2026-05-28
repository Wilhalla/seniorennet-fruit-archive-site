import { archiveYear } from './archiveDateTime'

export type ArchiveSeriesRecord = {
  id: string
  title?: string
  primaryPostId: string
  postIds: string[]
  postCount?: number
}

export type ArchiveSeriesPost = {
  id: string
  title: string
  isoDate: string
  images?: string[]
  imageCount: number
  reactionCount: number
  reactions?: unknown[]
  isSeries?: boolean
  seriesId?: string
  seriesPostIds?: string[]
  seriesPostCount?: number
}

export type ArchiveSeriesDetail<T extends ArchiveSeriesPost> = {
  id: string
  primaryPostId: string
  postIds: string[]
  posts: T[]
}

function uniqueImages(posts: ArchiveSeriesPost[]) {
  const seen = new Set<string>()
  const images: string[] = []
  for (const post of posts) {
    for (const image of post.images ?? []) {
      if (seen.has(image)) continue
      seen.add(image)
      images.push(image)
    }
  }
  return images
}

function aggregatePost<T extends ArchiveSeriesPost>(primary: T, record: ArchiveSeriesRecord, parts: T[]): T {
  const images = uniqueImages(parts)
  const reactions = parts.some((part) => Array.isArray(part.reactions))
    ? parts.flatMap((part) => part.reactions ?? [])
    : undefined
  return {
    ...primary,
    title: record.title || primary.title,
    images,
    imageCount: parts.reduce((sum, part) => sum + part.imageCount, 0),
    reactionCount: parts.reduce((sum, part) => sum + part.reactionCount, 0),
    ...(reactions ? { reactions } : {}),
    isSeries: true,
    seriesId: record.id,
    seriesPostIds: record.postIds,
    seriesPostCount: record.postCount ?? parts.length,
  }
}

export function buildArchiveSeries<T extends ArchiveSeriesPost>(posts: readonly T[], seriesRecords: readonly ArchiveSeriesRecord[]) {
  const all = [...posts]
  const postsById = new Map(all.map((post) => [post.id, post]))
  const seriesByPostId = new Map<string, ArchiveSeriesRecord>()
  for (const series of seriesRecords) {
    for (const postId of series.postIds) seriesByPostId.set(postId, series)
  }

  function partsFor(record: ArchiveSeriesRecord) {
    return record.postIds.map((postId) => postsById.get(postId)).filter((post): post is T => Boolean(post))
  }

  function getSeriesForPost(postId: string): ArchiveSeriesDetail<T> | undefined {
    const record = seriesByPostId.get(postId)
    if (!record) return undefined
    const posts = partsFor(record)
    if (posts.length < 2) return undefined
    return { id: record.id, primaryPostId: record.primaryPostId, postIds: record.postIds, posts }
  }

  function aggregateSeriesPost(series: ArchiveSeriesDetail<T>) {
    const record = seriesRecords.find((item) => item.id === series.id) ?? {
      id: series.id,
      primaryPostId: series.primaryPostId,
      postIds: series.postIds,
      postCount: series.posts.length,
    }
    const primary = postsById.get(series.primaryPostId) ?? series.posts[0]
    return aggregatePost(primary, record, series.posts)
  }

  const aggregated = all.flatMap((post) => {
    const record = seriesByPostId.get(post.id)
    if (!record) return [post]
    if (record.primaryPostId !== post.id) return []
    const parts = partsFor(record)
    if (parts.length < 2) return [post]
    return [aggregatePost(post, record, parts)]
  })

  const stats = {
    postCount: all.length,
    aggregatedPostCount: aggregated.length,
    seriesCount: seriesRecords.length,
    seriesPostCount: seriesRecords.reduce((sum, series) => sum + (series.postCount ?? series.postIds.length), 0),
    imageCount: all.reduce((sum, post) => sum + post.imageCount, 0),
    reactionCount: all.reduce((sum, post) => sum + post.reactionCount, 0),
    yearCount: new Set(all.map((post) => archiveYear(post)).filter(Boolean)).size,
  }

  return { all, aggregated, stats, getSeriesForPost, aggregateSeriesPost }
}
