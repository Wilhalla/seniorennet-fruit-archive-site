import { archiveMonthLabel, buildArchiveChronology } from './archiveDateTime'
import { archiveAssetUrl, archiveSmallThumbUrl } from './assetUrls'
import { fetchJson, type FetchPriority } from './clientFetch'

export type GalleryImageRecord = {
  id: string
  src: string
  thumbSrc?: string
  postId?: string
  postSlug: string
  postTitle: string
  date: string
  isoDate?: string
  year: number | null
  month: number | null
  season: string
  topicId?: string
  excerpt: string
  caption: string
  imageIndex?: number
  width?: number | null
  height?: number | null
  dominantColor?: string
  ok?: boolean
  visualTags: string[]
  visualClusterId?: string
}

export type GalleryGroups = {
  years: Array<{ id: string; label: string; count: number }>
  seasons: Array<{ id: string; label: string; count: number }>
  themes: Array<{ id: string; label: string; icon: string; count: number }>
}

export type SpeciesTag = {
  label: string
  type: string
  confidence: 'high' | 'medium' | 'low'
  sources: string[]
  evidence: Array<{ source: string; field: string; snippet: string }>
  candidateId: string
}

export type SpeciesGroup = { id: string; label: string; type: string; count: number; confidenceCounts: Record<string, number> }
export type SpeciesImageTags = { imageId: string; postId: string; postSlug: string; tags: SpeciesTag[] }

export type GalleryFilters = {
  query: string
  selectedYear: string
  theme: string
  speciesFilter: string
  season: string
  peoplePlantsOnly: boolean
  sortNewest: boolean
}

export type GalleryUrlState = GalleryFilters & { viewerId: string | null }

export const galleryViewerRoute = '/gallery/view/'
export const gallerySlideshowRoute = '/gallery/slideshow/'

export type GalleryVirtualRow<T extends GalleryImageRecord = GalleryImageRecord> =
  | { type: 'year'; key: string; year: string }
  | { type: 'month'; key: string; year: string; label: string; count: number }
  | { type: 'images'; key: string; year: string; images: T[] }

const peoplePlantTags = ['familie', 'tuin', 'tuinwerk', 'fruit', 'bloemen', 'dieren', 'landschap']

export const emptyGalleryGroups: GalleryGroups = { years: [], seasons: [], themes: [] }
export const MIN_HIGH_PRIORITY_THUMBNAILS = 6
export const MIN_EAGER_THUMBNAILS = 12

export type ImageGallerySession<T extends GalleryImageRecord = GalleryImageRecord> = {
  imageById: Map<string, T>
  filtered: T[]
  rows: GalleryVirtualRow<T>[]
  visibleThemes: GalleryGroups['themes']
  viewerImage: T | null
  viewerIndex: number
  previousImage: T | null
  nextImage: T | null
  relatedImages: T[]
  highPriorityThumbnailIds: Set<string>
  eagerThumbnailIds: Set<string>
}

export function fetchGalleryJson<T>(url: string, priority?: FetchPriority, signal?: AbortSignal): Promise<T> {
  return fetchJson<T>(url, { priority, signal })
}

export function imageThumbSrc(image: Pick<GalleryImageRecord, 'src'>) {
  return archiveSmallThumbUrl(image.src)
}

export function imageFullSrc(image: Pick<GalleryImageRecord, 'src'>) {
  return archiveAssetUrl(image.src)
}

export function formatImagePostDateTime(image: Pick<GalleryImageRecord, 'date' | 'isoDate'>) {
  const dateLabel = formatGalleryImageDate(image.isoDate || image.date)
  const timeMatch = image.isoDate?.match(/T(\d{2}:\d{2})/)
  const timeLabel = timeMatch?.[1] && timeMatch[1] !== '00:00' ? timeMatch[1] : ''
  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel
}

export function imageNumberLabel(image: Pick<GalleryImageRecord, 'imageIndex'>) {
  return typeof image.imageIndex === 'number' ? ` · beeld ${image.imageIndex + 1}` : ''
}

export function imageDownloadFilename(image: Pick<GalleryImageRecord, 'id' | 'src'>) {
  const sourcePath = image.src.split(/[?#]/)[0]
  const filename = sourcePath.split('/').filter(Boolean).at(-1)
  return filename ? decodeURIComponent(filename) : `${image.id}.jpg`
}

export function galleryFiltersFromUrlState(state: GalleryUrlState): GalleryFilters {
  return {
    query: state.query,
    selectedYear: state.selectedYear,
    theme: state.theme,
    speciesFilter: state.speciesFilter,
    season: state.season,
    peoplePlantsOnly: state.peoplePlantsOnly,
    sortNewest: state.sortNewest,
  }
}

export function columnsForGalleryWidth(width: number) {
  if (width >= 1024) return 5
  if (width >= 768) return 4
  return 2
}

export function normalizeSpeciesGroups(groups: Array<Omit<SpeciesGroup, 'confidenceCounts'> & { confidenceCounts: Record<string, number | undefined> }> = []): SpeciesGroup[] {
  return groups.map((group) => ({
    ...group,
    confidenceCounts: Object.fromEntries(Object.entries(group.confidenceCounts).filter((entry): entry is [string, number] => typeof entry[1] === 'number')),
  }))
}

export function galleryMonthKey(image: Pick<GalleryImageRecord, 'year' | 'month'>) {
  if (!image.year || !image.month) return 'unknown'
  return `${image.year}-${String(image.month).padStart(2, '0')}`
}

export function galleryMonthLabel(key: string) {
  return key === 'unknown' ? 'Datum onbekend' : archiveMonthLabel(`m-${key}`)
}

export function formatGalleryImageDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

export function filterGalleryImages<T extends GalleryImageRecord>(images: readonly T[], filters: GalleryFilters, speciesByImage: Record<string, SpeciesTag[]>) {
  const q = filters.query.trim().toLowerCase()
  return images
    .filter((image) => !filters.selectedYear || String(image.year) === filters.selectedYear)
    .filter((image) => filters.season === 'all' || image.season === filters.season)
    .filter((image) => filters.theme === 'all' || image.visualTags.includes(filters.theme))
    .filter((image) => filters.speciesFilter === 'all' || (speciesByImage[image.id] ?? []).some((tag) => tag.candidateId === filters.speciesFilter))
    .filter((image) => !filters.peoplePlantsOnly || image.visualTags.some((tag) => peoplePlantTags.includes(tag)))
    .filter((image) => !q || `${image.postTitle} ${image.caption} ${image.excerpt} ${image.visualTags.join(' ')} ${(speciesByImage[image.id] ?? []).map((tag) => tag.label).join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const byDate = Date.parse(b.date) - Date.parse(a.date)
      return filters.sortNewest ? byDate : -byDate
    })
}

export function visibleGalleryThemes<T extends GalleryImageRecord>(filtered: readonly T[], groups: GalleryGroups) {
  const counts = new Map<string, number>()
  for (const image of filtered) {
    for (const tag of image.visualTags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return groups.themes
    .map((item) => ({ ...item, count: counts.get(item.id) ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
}

export function groupGalleryImagesByMonth<T extends GalleryImageRecord>(filtered: readonly T[]) {
  return buildArchiveChronology(filtered, { sort: false }).monthGroups.map((month) => ({
    key: month.key.replace(/^m-/, '') === 'ongedateerd' ? 'unknown' : month.key.replace(/^m-/, ''),
    year: month.year === 'ongedateerd' ? 'unknown' : month.year,
    label: month.label,
    images: month.items,
    startsYear: month.startsYear,
  }))
}

export function buildGalleryRows<T extends GalleryImageRecord>(filtered: readonly T[], columns: number): GalleryVirtualRow<T>[] {
  const rows: GalleryVirtualRow<T>[] = []
  for (const month of groupGalleryImagesByMonth(filtered)) {
    if (month.startsYear) rows.push({ type: 'year', key: `year-${month.year}`, year: month.year })
    rows.push({ type: 'month', key: `month-${month.key}`, year: month.year, label: month.label, count: month.images.length })
    for (let index = 0; index < month.images.length; index += columns) {
      rows.push({ type: 'images', key: `images-${month.key}-${index}`, year: month.year, images: month.images.slice(index, index + columns) })
    }
  }
  return rows
}

export function buildImageGallerySession<T extends GalleryImageRecord>({
  images,
  filters,
  speciesByImage,
  groups = emptyGalleryGroups,
  columns = 0,
  viewerId = null,
  related = {},
}: {
  images: readonly T[]
  filters: GalleryFilters
  speciesByImage: Record<string, SpeciesTag[]>
  groups?: GalleryGroups
  columns?: number
  viewerId?: string | null
  related?: Record<string, string[]>
}): ImageGallerySession<T> {
  const imageById = new Map(images.map((image) => [image.id, image]))
  const filtered = filterGalleryImages(images, filters, speciesByImage)
  const viewerImage = viewerId ? imageById.get(viewerId) ?? null : null
  const viewerIndex = viewerImage ? filtered.findIndex((image) => image.id === viewerImage.id) : -1
  const previousImage = viewerIndex > 0 ? filtered[viewerIndex - 1] ?? null : null
  const nextImage = viewerIndex >= 0 && viewerIndex < filtered.length - 1 ? filtered[viewerIndex + 1] ?? null : null
  const rowColumns = Math.max(0, columns)
  return {
    imageById,
    filtered,
    rows: rowColumns > 0 ? buildGalleryRows(filtered, rowColumns) : [],
    visibleThemes: visibleGalleryThemes(filtered, groups),
    viewerImage,
    viewerIndex,
    previousImage,
    nextImage,
    relatedImages: relatedGalleryImages(viewerImage, images, imageById, related),
    highPriorityThumbnailIds: new Set(filtered.slice(0, Math.max(rowColumns, MIN_HIGH_PRIORITY_THUMBNAILS)).map((image) => image.id)),
    eagerThumbnailIds: new Set(filtered.slice(0, Math.max(rowColumns * 2, MIN_EAGER_THUMBNAILS)).map((image) => image.id)),
  }
}

export function shouldLoadGalleryRelated(state: { viewerId: string | null; relatedLoaded: boolean; relatedLoading: boolean }) {
  return Boolean(state.viewerId) && !state.relatedLoaded && !state.relatedLoading
}

export function shouldLoadGallerySpeciesTags(state: { speciesFilter: string; query: string; speciesTagsLoaded: boolean; speciesTagsLoading: boolean }) {
  const queryNeedsSpeciesLabels = state.query.trim().length >= 3
  return (state.speciesFilter !== 'all' || queryNeedsSpeciesLabels) && !state.speciesTagsLoaded && !state.speciesTagsLoading
}

export function relatedGalleryImages<T extends GalleryImageRecord>(viewerImage: T | null, images: readonly T[], imageById: Map<string, T>, related: Record<string, string[]>, limit = 10) {
  if (!viewerImage) return []
  const seen = new Set<string>([viewerImage.id])
  const direct = (related[viewerImage.id] ?? [])
    .map((id) => imageById.get(id))
    .filter((image): image is T => Boolean(image))
    .filter((image) => {
      if (seen.has(image.id)) return false
      seen.add(image.id)
      return true
    })
  const cluster = images
    .filter((image) => image.visualClusterId && image.visualClusterId === viewerImage.visualClusterId)
    .filter((image) => {
      if (seen.has(image.id)) return false
      seen.add(image.id)
      return true
    })
  return [...direct, ...cluster].slice(0, limit)
}

export function imageGalleryStateFromUrl(search: string): GalleryUrlState {
  const params = new URLSearchParams(search)
  return {
    query: params.get('q') ?? '',
    theme: params.get('theme') || 'all',
    speciesFilter: params.get('species') || 'all',
    selectedYear: params.get('year') ?? '',
    season: params.get('season') || 'all',
    peoplePlantsOnly: params.get('peoplePlants') === '1',
    sortNewest: params.get('sort') !== 'old',
    viewerId: params.get('img') || params.get('image'),
  }
}

function gallerySearchParamsFromState(state: GalleryUrlState, includeViewerId: boolean) {
  const params = new URLSearchParams()
  if (state.query.trim()) params.set('q', state.query.trim())
  if (state.theme !== 'all') params.set('theme', state.theme)
  if (state.speciesFilter !== 'all') params.set('species', state.speciesFilter)
  if (state.selectedYear) params.set('year', state.selectedYear)
  if (state.season !== 'all') params.set('season', state.season)
  if (state.peoplePlantsOnly) params.set('peoplePlants', '1')
  if (!state.sortNewest) params.set('sort', 'old')
  if (includeViewerId && state.viewerId) params.set('img', state.viewerId)
  return params
}

export function galleryUrlFromState(pathname: string, state: GalleryUrlState, hash = '') {
  const queryString = gallerySearchParamsFromState(state, false).toString()
  return `${pathname}${queryString ? `?${queryString}` : ''}${hash}`
}

export function galleryViewerPageUrl(state: GalleryUrlState, hash = '') {
  const queryString = gallerySearchParamsFromState(state, true).toString()
  return `${galleryViewerRoute}${queryString ? `?${queryString}` : ''}${hash}`
}

export function gallerySlideshowPageUrl(state: GalleryUrlState, hash = '') {
  const queryString = gallerySearchParamsFromState(state, true).toString()
  return `${gallerySlideshowRoute}${queryString ? `?${queryString}` : ''}${hash}`
}
