import { describe, expect, it } from 'vitest'
import { buildGalleryRows, buildImageGallerySession, filterGalleryImages, formatImagePostDateTime, galleryFiltersFromUrlState, gallerySlideshowPageUrl, galleryUrlFromState, galleryViewerPageUrl, imageDownloadFilename, imageGalleryStateFromUrl, imageNumberLabel, relatedGalleryImages, shouldLoadGalleryRelated, shouldLoadGallerySpeciesTags, visibleGalleryThemes } from './imageGallerySession'

const images = [
  { id: 'a', src: '/archive-images/a.jpg', postSlug: 'a', postTitle: 'Apple blossom', date: '2008-03-07', year: 2008, month: 3, season: 'lente', excerpt: 'first', caption: 'bloesem', visualTags: ['fruit', 'bloemen'], visualClusterId: 'c1' },
  { id: 'b', src: '/archive-images/b.jpg', postSlug: 'b', postTitle: 'Pear harvest', date: '2007-09-02', year: 2007, month: 9, season: 'herfst', excerpt: 'second', caption: 'peer', visualTags: ['fruit'], visualClusterId: 'c1' },
  { id: 'c', src: '/archive-images/c.jpg', postSlug: 'c', postTitle: 'Visitors', date: '2007-09-03', year: 2007, month: 9, season: 'herfst', excerpt: 'third', caption: 'mensen', visualTags: ['familie'], visualClusterId: 'c2' },
]

const groups = {
  years: [],
  seasons: [],
  themes: [
    { id: 'fruit', label: 'Fruit & rassen', icon: '🍐', count: 0 },
    { id: 'bloemen', label: 'Bloesem & bloemen', icon: '🌸', count: 0 },
    { id: 'familie', label: 'Familie & mensen', icon: '👥', count: 0 },
  ],
}

describe('image gallery session', () => {
  it('filters and sorts image records by current gallery state', () => {
    const filtered = filterGalleryImages(images, {
      query: 'apple',
      selectedYear: '',
      theme: 'fruit',
      speciesFilter: 'all',
      season: 'lente',
      peoplePlantsOnly: true,
      sortNewest: true,
    }, {})

    expect(filtered.map((image) => image.id)).toEqual(['a'])
  })

  it('builds visible theme counts and virtual rows from filtered images', () => {
    const rows = buildGalleryRows(images, 2)
    const themes = visibleGalleryThemes(images, groups)

    expect(rows.map((row) => row.type)).toEqual(['year', 'month', 'images', 'year', 'month', 'images'])
    expect(themes.map((theme) => [theme.id, theme.count])).toEqual([
      ['fruit', 2],
      ['bloemen', 1],
      ['familie', 1],
    ])
  })

  it('derives viewer-related images from direct related ids before cluster fallback', () => {
    const related = relatedGalleryImages(images[0]!, images, new Map(images.map((image) => [image.id, image])), { a: ['c', 'b'] })

    expect(related.map((image) => image.id)).toEqual(['c', 'b'])
  })

  it('decides when lazy gallery data should load', () => {
    expect(shouldLoadGalleryRelated({ viewerId: 'a', relatedLoaded: false, relatedLoading: false })).toBe(true)
    expect(shouldLoadGalleryRelated({ viewerId: null, relatedLoaded: false, relatedLoading: false })).toBe(false)
    expect(shouldLoadGallerySpeciesTags({ speciesFilter: 'sterappel', query: '', speciesTagsLoaded: false, speciesTagsLoading: false })).toBe(true)
    expect(shouldLoadGallerySpeciesTags({ speciesFilter: 'all', query: 'appel', speciesTagsLoaded: false, speciesTagsLoading: false })).toBe(true)
    expect(shouldLoadGallerySpeciesTags({ speciesFilter: 'all', query: 'ap', speciesTagsLoaded: false, speciesTagsLoading: false })).toBe(false)
    expect(shouldLoadGallerySpeciesTags({ speciesFilter: 'all', query: '', speciesTagsLoaded: false, speciesTagsLoading: false })).toBe(false)
  })

  it('round-trips URL state without losing the selected image', () => {
    const state = imageGalleryStateFromUrl('?q=appel&theme=fruit&species=sterappel&year=2008&season=lente&peoplePlants=1&sort=old&img=a')

    expect(state).toMatchObject({ query: 'appel', theme: 'fruit', speciesFilter: 'sterappel', selectedYear: '2008', season: 'lente', peoplePlantsOnly: true, sortNewest: false, viewerId: 'a' })
    expect(galleryFiltersFromUrlState(state)).toEqual({ query: 'appel', theme: 'fruit', speciesFilter: 'sterappel', selectedYear: '2008', season: 'lente', peoplePlantsOnly: true, sortNewest: false })
    expect(galleryUrlFromState('/gallery/', state)).toBe('/gallery/?q=appel&theme=fruit&species=sterappel&year=2008&season=lente&peoplePlants=1&sort=old')
    expect(galleryViewerPageUrl(state)).toBe('/gallery/view/?q=appel&theme=fruit&species=sterappel&year=2008&season=lente&peoplePlants=1&sort=old&img=a')
    expect(gallerySlideshowPageUrl(state)).toBe('/gallery/slideshow/?q=appel&theme=fruit&species=sterappel&year=2008&season=lente&peoplePlants=1&sort=old&img=a')
  })

  it('keeps shared viewer image labels behind the gallery session module', () => {
    expect(formatImagePostDateTime({ date: '2008-03-07', isoDate: '2008-03-07T13:45:00' })).toBe('07 maart 2008 · 13:45')
    expect(imageNumberLabel({ imageIndex: 2 })).toBe(' · beeld 3')
    expect(imageDownloadFilename({ id: 'fallback', src: '/archive-images/fruit/a%20b.JPG?x=1' })).toBe('a b.JPG')
  })

  it('builds one image gallery session snapshot for callers', () => {
    const session = buildImageGallerySession({
      images,
      filters: { query: '', selectedYear: '', theme: 'all', speciesFilter: 'all', season: 'all', peoplePlantsOnly: false, sortNewest: true },
      speciesByImage: {},
      groups,
      columns: 2,
      viewerId: 'b',
      related: { b: ['c'] },
    })

    expect(session.filtered.map((image) => image.id)).toEqual(['a', 'c', 'b'])
    expect(session.viewerImage?.id).toBe('b')
    expect(session.previousImage?.id).toBe('c')
    expect(session.nextImage).toBeNull()
    expect(session.relatedImages.map((image) => image.id)).toEqual(['c', 'a'])
    expect(session.rows.map((row) => row.type)).toEqual(['year', 'month', 'images', 'year', 'month', 'images'])
    expect(session.visibleThemes.map((theme) => theme.id)).toEqual(['fruit', 'bloemen', 'familie'])
  })
})
