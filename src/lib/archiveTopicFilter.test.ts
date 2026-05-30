import { describe, expect, it } from 'vitest'
import { activeArchiveTopicFromSearch, archiveTopicFilterLabel, filterArchivePostsByTopic } from './archiveTopicFilter'

describe('archive topic filtering', () => {
  it('reads the atlas topic query parameter from archive URLs', () => {
    expect(activeArchiveTopicFromSearch('?topic=topic-03')).toBe('topic-03')
    expect(activeArchiveTopicFromSearch('?year=2008')).toBe('')
  })

  it('filters archive posts to posts tagged with the active topic', () => {
    const posts = [
      { id: 'one', topicIds: ['topic-01'] },
      { id: 'series', topicIds: ['topic-02', 'topic-03'] },
      { id: 'untagged' },
    ]

    expect(filterArchivePostsByTopic(posts, 'topic-03').map((post) => post.id)).toEqual(['series'])
    expect(filterArchivePostsByTopic(posts, '').map((post) => post.id)).toEqual(['one', 'series', 'untagged'])
  })

  it('uses human topic labels when a topic filter is active', () => {
    expect(archiveTopicFilterLabel({ id: 'topic-03', label: 'Enten en snoeien', generatedLabel: 'appel, peren' }, 'topic-03')).toBe('Enten en snoeien')
    expect(archiveTopicFilterLabel({ id: 'topic-04', label: 'Nog te benoemen', generatedLabel: 'kwee, fruit' }, 'topic-04')).toBe('kwee, fruit')
    expect(archiveTopicFilterLabel(undefined, 'topic-99')).toBe('topic-99')
  })
})
