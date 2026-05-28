import { describe, expect, it } from 'vitest'
import { buildArchiveSeries } from './archiveSeries'

type TestPost = {
  id: string
  slug: string
  title: string
  isoDate: string
  images: string[]
  imageCount: number
  reactionCount: number
  reactions?: string[]
}

const posts: TestPost[] = [
  { id: '1', slug: 'one', title: 'One', isoDate: '2008-01-01', images: ['/a.jpg', '/b.jpg'], imageCount: 2, reactionCount: 1, reactions: ['r1'] },
  { id: '2', slug: 'two', title: 'Two', isoDate: '2008-01-02', images: ['/b.jpg', '/c.jpg'], imageCount: 2, reactionCount: 2, reactions: ['r2', 'r3'] },
  { id: '3', slug: 'three', title: 'Three', isoDate: '2008-01-03', images: ['/d.jpg'], imageCount: 1, reactionCount: 0, reactions: [] },
]

const series = [{ id: 's1', title: 'Series title', primaryPostId: '1', postIds: ['1', '2'], postCount: 2 }]

describe('post series aggregation', () => {
  it('shows a post series once in aggregated archive views while leaving all archive posts addressable', () => {
    const archive = buildArchiveSeries(posts, series)

    expect(archive.all.map((post) => post.id)).toEqual(['1', '2', '3'])
    expect(archive.aggregated.map((post) => post.id)).toEqual(['1', '3'])
    expect(archive.aggregated[0]).toMatchObject({
      id: '1',
      title: 'Series title',
      imageCount: 4,
      reactionCount: 3,
      isSeries: true,
      seriesId: 's1',
      seriesPostIds: ['1', '2'],
      seriesPostCount: 2,
    })
    expect(archive.aggregated[0]?.images).toEqual(['/a.jpg', '/b.jpg', '/c.jpg'])
  })

  it('returns detailed series membership and aggregates detailed reactions from the primary archive post', () => {
    const archive = buildArchiveSeries(posts, series)
    const detail = archive.getSeriesForPost('2')
    const aggregated = detail ? archive.aggregateSeriesPost(detail) : undefined

    expect(detail?.posts.map((post) => post.id)).toEqual(['1', '2'])
    expect(aggregated?.slug).toBe('one')
    expect(aggregated?.reactions).toEqual(['r1', 'r2', 'r3'])
  })

  it('exposes stats for all archive posts and aggregated post series', () => {
    const archive = buildArchiveSeries(posts, series)

    expect(archive.stats).toMatchObject({
      postCount: 3,
      aggregatedPostCount: 2,
      seriesCount: 1,
      seriesPostCount: 2,
      imageCount: 5,
      reactionCount: 3,
      yearCount: 1,
    })
  })
})
