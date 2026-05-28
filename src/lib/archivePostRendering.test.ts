import { describe, expect, it } from 'vitest'
import { archivePostPartHtml, archivePostPartLabel, buildArchivePostRendering } from './archivePostRendering'
import type { Post } from './postDetails'

function post(overrides: Partial<Post>): Post {
  return {
    id: '1',
    blog: 'fruit',
    slug: 'one',
    title: 'Titel',
    date: '01-01-2008',
    isoDate: '2008-01-01T00:00:00',
    time: '00:00',
    author: 'Daniel',
    excerpt: '',
    html: '<h1>Titel</h1><p>Body</p>',
    images: [],
    imageCount: 0,
    reactionCount: 0,
    sourcePath: '',
    reactions: [],
    ...overrides,
  }
}

describe('archive post rendering module', () => {
  it('labels post series parts and strips duplicate legacy titles', () => {
    expect(archivePostPartLabel(1, 3)).toBe('Deel 2 van 3')
    expect(archivePostPartLabel(0, 1)).toBe('Bericht')
    expect(archivePostPartHtml(post({}))).toBe('<p>Body</p>')
  })

  it('builds one rendering model for single posts and post series', async () => {
    const first = post({ id: '1', slug: 'one', images: ['/archive-images/a.jpg'], imageCount: 1 })
    const second = post({ id: '2', slug: 'two', title: 'Twee', images: ['/archive-images/b.jpg'], imageCount: 1 })

    const single = await buildArchivePostRendering(first)
    expect(single.isSeries).toBe(false)
    expect(single.parts.map((part) => part.id)).toEqual(['1'])

    const series = await buildArchivePostRendering(first, [first, second])
    expect(series.isSeries).toBe(true)
    expect(series.parts.map((part) => part.id)).toEqual(['1', '2'])
    expect(series.imageEntries.map((image) => image.src)).toEqual(['/archive-images/a.jpg', '/archive-images/b.jpg'])
  })
})
