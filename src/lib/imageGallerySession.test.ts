import { describe, expect, it } from 'vitest'
import { buildGalleryRows, filterGalleryImages, formatImagePostDateTime, galleryFiltersFromUrlState, gallerySlideshowPageUrl, galleryUrlFromState, galleryViewerPageUrl, imageDownloadFilename, imageGalleryStateFromUrl, imageNumberLabel, relatedGalleryImages, shouldLoadGalleryRelated, shouldLoadGallerySpeciesTags, visibleGalleryThemes } from './imageGallerySession'

const images = [
  { id: 'a', src: '/archive-images/a.jpg', postSlug: 'a', postTitle: 'Apple blossom', date: '2008-03-07', year: 2008, month: 3, season: 'lente', excerpt: 'first', caption: 'bloesem', visualTags: ['appels', 'bloesem'], visualClusterId: 'c1' },
  { id: 'b', src: '/archive-images/b.jpg', postSlug: 'b', postTitle: 'Pear harvest', date: '2007-09-02', year: 2007, month: 9, season: 'herfst', excerpt: 'second', caption: 'peer', visualTags: ['peren'], visualClusterId: 'c1' },
  { id: 'c', src: '/archive-images/c.jpg', postSlug: 'c', postTitle: 'Visitors', date: '2007-09-03', year: 2007, month: 9, season: 'herfst', excerpt: 'third', caption: 'mensen', visualTags: ['mensen'], visualClusterId: 'c2' },
]

const groups = {
  years: [],
  seasons: [],
  themes: [
    { id: 'appels', label: 'Appels', icon: '🍏', count: 0 },
    { id: 'bloesem', label: 'Bloesem', icon: '🌸', count: 0 },
    { id: 'peren', label: 'Peren', icon: '🍐', count: 0 },
    { id: 'mensen', label: 'Mensen', icon: '👥', count: 0 },
  ],
}

describe('image gallery session', () => {
  it('filters and sorts image records by current gallery state', () => {
    const filtered = filterGalleryImages(images, {
      query: 'apple',
      selectedYear: '',
      theme: 'appels',
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
      ['appels', 1],
      ['bloesem', 1],
      ['peren', 1],
      ['mensen', 1],
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
    expect(shouldLoadGallerySpeciesTags({ speciesFilter: 'all', query: '', speciesTagsLoaded: false, speciesTagsLoading: false })).toBe(false)
  })

  it('round-trips URL state without losing the selected image', () => {
    const state = imageGalleryStateFromUrl('?q=appel&theme=appels&species=sterappel&year=2008&season=lente&peoplePlants=1&sort=old&img=a')

    expect(state).toMatchObject({ query: 'appel', theme: 'appels', speciesFilter: 'sterappel', selectedYear: '2008', season: 'lente', peoplePlantsOnly: true, sortNewest: false, viewerId: 'a' })
    expect(galleryFiltersFromUrlState(state)).toEqual({ query: 'appel', theme: 'appels', speciesFilter: 'sterappel', selectedYear: '2008', season: 'lente', peoplePlantsOnly: true, sortNewest: false })
    expect(galleryUrlFromState('/gallery/', state)).toBe('/gallery/?q=appel&theme=appels&species=sterappel&year=2008&season=lente&peoplePlants=1&sort=old')
    expect(galleryViewerPageUrl(state)).toBe('/gallery/view/?q=appel&theme=appels&species=sterappel&year=2008&season=lente&peoplePlants=1&sort=old&img=a')
    expect(gallerySlideshowPageUrl(state)).toBe('/gallery/slideshow/?q=appel&theme=appels&species=sterappel&year=2008&season=lente&peoplePlants=1&sort=old&img=a')
  })

  it('keeps shared viewer image labels behind the gallery session module', () => {
    expect(formatImagePostDateTime({ date: '2008-03-07', isoDate: '2008-03-07T13:45:00' })).toBe('07 maart 2008 · 13:45')
    expect(imageNumberLabel({ imageIndex: 2 })).toBe(' · beeld 3')
    expect(imageDownloadFilename({ id: 'fallback', src: '/archive-images/fruit/a%20b.JPG?x=1' })).toBe('a b.JPG')
  })
})
