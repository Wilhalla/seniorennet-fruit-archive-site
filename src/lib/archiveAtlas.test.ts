import { describe, expect, it } from 'vitest'
import { buildAtlasBrowse, buildAtlasSpatialIndex, categoryFor, colorMix, queryAtlasSpatialIndex, rawAtlasUnitCoordinate, shortLabel, topicDisplayLabel, topicKeywords, type AtlasFilters, type MapPoint, type Topic } from './archiveAtlas'

describe('archive atlas renderer module', () => {
  it('maps archive topics onto stable atlas categories', () => {
    expect(categoryFor({ id: 't1', label: 'Appels', generatedLabel: 'appel, boomgaard', postCount: 1, representativePostIds: [] })?.id).toBe('fruit')
    expect(categoryFor({ id: 't2', label: 'Nog te benoemen', generatedLabel: 'dieren & insecten, vogel', postCount: 1, representativePostIds: [] })?.id).toBe('animals')
  })

  it('derives compact display labels and keywords without leaking broad visual terms', () => {
    const topic = { id: 't3', label: 'Nog te benoemen', generatedLabel: 'tuin & teelt', textKeywords: ['enten', 'snoei'], visualKeywords: ['mensen'], postCount: 3, representativePostIds: [] }

    expect(topicDisplayLabel(topic)).toBe('Enten, Snoei')
    expect(topicKeywords(topic)).toEqual(['enten', 'snoei'])
    expect(shortLabel('abcdefghijklmnopqrstuvwxyz', 8)).toBe('abcdefg…')
  })

  it('converts hex colors to canvas rgba strings', () => {
    expect(colorMix('#0f172a', 0.5)).toBe('rgba(15, 23, 42, 0.5)')
    expect(colorMix('currentColor', 0.5)).toBe('currentColor')
  })

  it('queries only atlas points inside viewport bounds', () => {
    const points: MapPoint[] = [
      { id: 'left', slug: 'left', title: 'Left', date: '2008-01-01', year: 2008, month: 1, season: 'winter', topicId: 'fruit-topic', x: 0.1, y: 0.5, imageCount: 0, excerpt: '' },
      { id: 'center', slug: 'center', title: 'Center', date: '2008-01-01', year: 2008, month: 1, season: 'winter', topicId: 'fruit-topic', x: 0.5, y: 0.5, imageCount: 0, excerpt: '' },
      { id: 'right', slug: 'right', title: 'Right', date: '2008-01-01', year: 2008, month: 1, season: 'winter', topicId: 'fruit-topic', x: 0.9, y: 0.5, imageCount: 0, excerpt: '' },
    ]
    const index = buildAtlasSpatialIndex(points, (point) => rawAtlasUnitCoordinate(point.x, point.y), 8)

    expect(queryAtlasSpatialIndex(index, { minX: 0.4, maxX: 0.6, minY: 0, maxY: 1 }).map((point) => point.id)).toEqual(['center'])
  })

  it('builds atlas browse facts behind one module interface', () => {
    const topics: Topic[] = [
      { id: 'fruit-topic', label: 'Appels', generatedLabel: 'appel', postCount: 2, representativePostIds: [] },
      { id: 'animal-topic', label: 'Dieren', generatedLabel: 'vogel', postCount: 1, representativePostIds: [] },
    ]
    const points: MapPoint[] = [
      { id: 'a', slug: 'a', title: 'Appel', date: '2008-01-01', year: 2008, month: 1, season: 'winter', topicId: 'fruit-topic', x: 0.2, y: 0.3, imageCount: 1, image: '/archive-images/a.jpg', excerpt: 'boomgaard' },
      { id: 'b', slug: 'b', title: 'Peer', date: '2007-01-01', year: 2007, month: 1, season: 'winter', topicId: 'fruit-topic', x: 0.25, y: 0.35, imageCount: 0, excerpt: 'fruit' },
      { id: 'c', slug: 'c', title: 'Vogel', date: '2007-02-01', year: 2007, month: 2, season: 'winter', topicId: 'animal-topic', x: 0.8, y: 0.7, imageCount: 1, excerpt: 'merel' },
    ]
    const filters: AtlasFilters = { topic: 'fruit-topic', year: 'all', season: 'winter', imagesOnly: false, search: 'fruit' }

    const browse = buildAtlasBrowse({ points, topics, filters, selectedPoint: points[0]!, selectedClusterId: 'fruit-topic' })

    expect(browse.visible.map((point) => point.id)).toEqual(['b'])
    expect(browse.years).toEqual([2008, 2007])
    expect(browse.sortedTopics.map((topic) => topic.id)).toEqual(['fruit-topic', 'animal-topic'])
    expect(browse.relatedPointIds.has('b')).toBe(true)
    expect(browse.selectedClusterStats?.imageCount).toBe(1)
    expect(browse.categoryBounds.get('fruit')).toMatchObject({ minX: 0.2, maxX: 0.25 })
  })
})
