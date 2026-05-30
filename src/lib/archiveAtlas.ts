import type { LucideIcon } from 'lucide-react'
import { Apple, Archive, Flower2, Leaf, Sprout, Users } from 'lucide-react'
import { archiveSmallThumbUrl, archiveThumbUrl, archiveTinyThumbUrl } from './assetUrls'
import { fetchJson as fetchClientJson } from './clientFetch'

export type MapPoint = {
  id: string
  slug: string
  title: string
  date: string
  year: number | null
  month: number | null
  season: string
  topicId: string
  x: number
  y: number
  imageCount: number
  image?: string | null
  excerpt: string
}

export type Topic = {
  id: string
  label: string
  generatedLabel: string
  visualKeywords?: string[]
  textKeywords?: string[]
  postCount: number
  representativePostIds: string[]
}

export type AtlasFilters = {
  topic: string
  year: string
  season: string
  imagesOnly: boolean
  search: string
}

export type AtlasViewMode = 'points' | 'clusters' | 'density'
export type ScreenPoint = { x: number; y: number }
export type RenderCluster = { x: number; y: number; count: number; topicId: string }

export type AtlasCategoryBounds = Map<string, { minX: number; maxX: number; minY: number; maxY: number }>
export type AtlasViewportBounds = { minX: number; maxX: number; minY: number; maxY: number }
export type AtlasIndexedPoint<TPoint extends MapPoint = MapPoint> = { point: TPoint; x: number; y: number }
export type AtlasSpatialIndex<TPoint extends MapPoint = MapPoint> = {
  gridSize: number
  points: AtlasIndexedPoint<TPoint>[]
  cells: Map<string, AtlasIndexedPoint<TPoint>[]>
}

export type AtlasSelectedClusterStats = {
  fromYear: number | null
  toYear: number | null
  topSeason: string | undefined
  imageCount: number
  representative: MapPoint
}

export type AtlasBrowse<TPoint extends MapPoint = MapPoint, TTopic extends Topic = Topic> = {
  topicsById: Map<string, TTopic>
  sortedTopics: TTopic[]
  years: number[]
  categoryBounds: AtlasCategoryBounds
  visible: TPoint[]
  visibleIds: Set<string>
  relatedPointIds: Set<string>
  selectedCluster: TTopic | null
  selectedClusterPoints: TPoint[]
  selectedClusterStats: AtlasSelectedClusterStats | null
}

export type AtlasCategory = {
  id: string
  label: string
  description: string
  Icon: LucideIcon
  match: RegExp
}

const dateFormatter = new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: 'long', year: 'numeric' })

export const atlasCategories: AtlasCategory[] = [
  { id: 'fruit', label: 'Appels & fruit', description: 'Rassen, oogst, boomgaard en fruitteelt.', Icon: Apple, match: /appel|appels|fruit|peer|peren|pruim|pruimen|kers|kersen|bes|bessen|framboos|druif|druiven|boomgaard/i },
  { id: 'garden', label: 'Tuin & teelt', description: 'Werk in de tuin, bodem, seizoenen en groei.', Icon: Sprout, match: /tuin|teelt|groei|plant|bodem|bloei|oogst|veld|snoei|zaai/i },
  { id: 'people', label: 'Mensen & reizen', description: 'Familie, uitstappen, steden en ontmoetingen.', Icon: Users, match: /mensen|reis|reizen|stad|kerk|museum|familie|bezoek|erfgoed|document/i },
  { id: 'animals', label: 'Dieren & insecten', description: 'Vogels, bijen, rupsen en ander tuinleven.', Icon: Flower2, match: /dier|dieren|insect|bij|bijen|vogel|vogels|koekoek|steenuil|rups|rupsen|vlinder|mees|merel/i },
  { id: 'heritage', label: 'Erfgoed & documenten', description: 'Geschiedenis, archiefsporen en bronnen.', Icon: Archive, match: /erfgoed|document|geschiedenis|archief|kerk|oude|bron/i },
  { id: 'landscape', label: 'Landschap', description: 'Plekken, parken, natuur en omgeving.', Icon: Leaf, match: /park|landschap|natuur|bos|veld|water|wandeling/i },
]

export const atlasCategoryColors: Record<string, string> = {
  fruit: '#8b5a2b',
  garden: '#567a4b',
  people: '#3f6f9f',
  animals: '#b7644a',
  heritage: '#8a7c65',
  landscape: '#c09035',
}

export const atlasTerritories: Record<string, { cx: number; cy: number; width: number; height: number }> = {
  people: { cx: 0.28, cy: 0.28, width: 0.28, height: 0.28 },
  heritage: { cx: 0.50, cy: 0.26, width: 0.24, height: 0.24 },
  animals: { cx: 0.75, cy: 0.34, width: 0.26, height: 0.27 },
  fruit: { cx: 0.36, cy: 0.68, width: 0.30, height: 0.30 },
  garden: { cx: 0.61, cy: 0.58, width: 0.30, height: 0.30 },
  landscape: { cx: 0.78, cy: 0.74, width: 0.24, height: 0.24 },
}

export const ATLAS_X_SPREAD = 0.9
export const ATLAS_Y_SPREAD = 0.82
export const MIN_ATLAS_SCALE = 0.75
export const MAX_ATLAS_SCALE = 18
export const ATLAS_SPATIAL_GRID_SIZE = 32

const broadVisualTopicTerms = new Set(['mensen', 'tuin & teelt', 'dieren & insecten', 'reizen & erfgoed', 'documenten'])

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function shortLabel(value: string, max = 34) {
  const label = String(value || '').replace(/\s+/g, ' ').trim()
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

export function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : dateFormatter.format(date)
}

export function topicSearchText(topic?: Topic) {
  if (!topic) return ''
  return [topic.label, topic.generatedLabel, ...(topic.visualKeywords ?? []), ...(topic.textKeywords ?? [])].join(' ').toLowerCase()
}

export function categoryFor(topic?: Topic) {
  const search = topicSearchText(topic)
  const label = `${topic?.label ?? ''} ${topic?.generatedLabel ?? ''}`.toLowerCase().trim()
  if (/^(appel|appels|fruit|peer|peren|pruim|pruimen|kers|bessen|druif|druiven|boomgaard)/.test(label)) return atlasCategories.find((category) => category.id === 'fruit')
  if (/^(dier|dieren|insect|insecten|koekoek|steenuil|vogel|vlinder|bij)/.test(label)) return atlasCategories.find((category) => category.id === 'animals')
  if (/^(mens|mensen|reis|reizen|familie|stad|bezoek)/.test(label)) return atlasCategories.find((category) => category.id === 'people')
  if (/^(erfgoed|document|geschiedenis|archief)/.test(label)) return atlasCategories.find((category) => category.id === 'heritage')
  if (/^(landschap|natuur|park|bos|wandeling)/.test(label)) return atlasCategories.find((category) => category.id === 'landscape')
  if (/^(tuin|teelt|bodem|snoei|zaai)/.test(label)) return atlasCategories.find((category) => category.id === 'garden')
  if (/appel|fruit|peer|peren|pruim|kers|bes|framboos|druif|boomgaard/.test(search)) return atlasCategories.find((category) => category.id === 'fruit')
  if (/dieren\s*&\s*insecten|dier|insect|vogel|bij|koekoek|steenuil|vlinder/.test(search)) return atlasCategories.find((category) => category.id === 'animals')
  if (/mensen\s*&\s*reizen|reis|reizen|familie|stad|bezoek/.test(search)) return atlasCategories.find((category) => category.id === 'people')
  if (/erfgoed|document|geschiedenis|archief/.test(search)) return atlasCategories.find((category) => category.id === 'heritage')
  if (/landschap|natuur|park|bos|wandeling/.test(search)) return atlasCategories.find((category) => category.id === 'landscape')
  if (/tuin\s*&\s*teelt|tuin|teelt|bodem|snoei|zaai/.test(search)) return atlasCategories.find((category) => category.id === 'garden')
  return atlasCategories.find((category) => category.match.test(search))
}

function titleCaseTopicLabel(value: string) {
  return String(value || '')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => term.charAt(0).toUpperCase() + term.slice(1))
    .join(', ')
}

function topicSpecificTerms(topic?: Topic) {
  const words = [...(topic?.textKeywords ?? []), ...(topic?.visualKeywords ?? [])]
  return [...new Set(words.map((word) => word.trim()).filter(Boolean))]
    .filter((word) => !broadVisualTopicTerms.has(word.toLowerCase()))
}

function normalizedTopicLabel(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function topicDisplayLabel(topic?: Topic, max = 30) {
  if (!topic) return 'Onbekend thema'
  const generatedTitle = titleCaseTopicLabel(topic.generatedLabel)
  const hasManualLabel = topic.label && topic.label !== 'Nog te benoemen' && normalizedTopicLabel(topic.label) !== normalizedTopicLabel(topic.generatedLabel)
  if (hasManualLabel) return shortLabel(topic.label, max)
  const specific = topicSpecificTerms(topic).slice(0, 3)
  if (specific.length) return shortLabel(titleCaseTopicLabel(specific.join(', ')), max)
  return shortLabel(generatedTitle || topic.id, max)
}

export function topicKeywords(topic?: Topic, limit = 6) {
  const specific = topicSpecificTerms(topic)
  if (specific.length) return specific.slice(0, limit)
  const words = [...(topic?.textKeywords ?? []), ...(topic?.visualKeywords ?? [])]
  return [...new Set(words.map((word) => word.trim()).filter(Boolean))].slice(0, limit)
}

export function themeValue(token: string) {
  if (typeof window === 'undefined') return 'currentColor'
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || 'currentColor'
}

export function colorMix(color: string, alpha: number) {
  if (color.startsWith('#') && color.length === 7) {
    const r = Number.parseInt(color.slice(1, 3), 16)
    const g = Number.parseInt(color.slice(3, 5), 16)
    const b = Number.parseInt(color.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

export function rawAtlasUnitCoordinate(rawX: number, rawY: number): ScreenPoint {
  return {
    x: 0.5 + (rawX - 0.5) * ATLAS_X_SPREAD,
    y: 0.5 + (rawY - 0.5) * ATLAS_Y_SPREAD,
  }
}

export function macroAtlasUnitCoordinate(categoryId: string, rawX: number, rawY: number, categoryBounds: AtlasCategoryBounds): ScreenPoint {
  const territory = atlasTerritories[categoryId] ?? atlasTerritories.heritage
  const bounds = categoryBounds.get(categoryId)
  const spanX = bounds && Number.isFinite(bounds.maxX - bounds.minX) ? Math.max(0.001, bounds.maxX - bounds.minX) : 1
  const spanY = bounds && Number.isFinite(bounds.maxY - bounds.minY) ? Math.max(0.001, bounds.maxY - bounds.minY) : 1
  const nx = bounds ? (rawX - bounds.minX) / spanX : rawX
  const ny = bounds ? (rawY - bounds.minY) / spanY : rawY
  return {
    x: clamp(territory.cx + (nx - 0.5) * territory.width, 0.035, 0.965),
    y: clamp(territory.cy + (ny - 0.5) * territory.height, 0.055, 0.945),
  }
}

export function atlasViewportBounds(rect: { width: number; height: number }, scale: number, pan: ScreenPoint, overscan = 120): AtlasViewportBounds {
  if (!rect.width || !rect.height || !scale) return { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  return {
    minX: (-pan.x - overscan) / (rect.width * scale),
    maxX: (rect.width - pan.x + overscan) / (rect.width * scale),
    minY: (-pan.y - overscan) / (rect.height * scale),
    maxY: (rect.height - pan.y + overscan) / (rect.height * scale),
  }
}

export function buildAtlasSpatialIndex<TPoint extends MapPoint>(points: readonly TPoint[], coordinateFor: (point: TPoint) => ScreenPoint, gridSize = ATLAS_SPATIAL_GRID_SIZE): AtlasSpatialIndex<TPoint> {
  const cells = new Map<string, AtlasIndexedPoint<TPoint>[]>()
  const indexedPoints = points.map((point) => ({ point, ...coordinateFor(point) }))
  for (const indexedPoint of indexedPoints) {
    const cellX = clamp(Math.floor(indexedPoint.x * gridSize), 0, gridSize - 1)
    const cellY = clamp(Math.floor(indexedPoint.y * gridSize), 0, gridSize - 1)
    const key = `${cellX}:${cellY}`
    const cell = cells.get(key) ?? []
    cell.push(indexedPoint)
    cells.set(key, cell)
  }
  return { gridSize, points: indexedPoints, cells }
}

export function queryAtlasSpatialIndex<TPoint extends MapPoint>(index: AtlasSpatialIndex<TPoint>, bounds: AtlasViewportBounds): TPoint[] {
  if (bounds.minX <= 0 && bounds.maxX >= 1 && bounds.minY <= 0 && bounds.maxY >= 1) return index.points.map(({ point }) => point)

  const startX = clamp(Math.floor(bounds.minX * index.gridSize), 0, index.gridSize - 1)
  const endX = clamp(Math.floor(bounds.maxX * index.gridSize), 0, index.gridSize - 1)
  const startY = clamp(Math.floor(bounds.minY * index.gridSize), 0, index.gridSize - 1)
  const endY = clamp(Math.floor(bounds.maxY * index.gridSize), 0, index.gridSize - 1)
  const result: TPoint[] = []
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const cell = index.cells.get(`${x}:${y}`)
      if (!cell) continue
      for (const indexedPoint of cell) {
        if (indexedPoint.x >= bounds.minX && indexedPoint.x <= bounds.maxX && indexedPoint.y >= bounds.minY && indexedPoint.y <= bounds.maxY) result.push(indexedPoint.point)
      }
    }
  }
  return result
}

export function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return fetchClientJson<T>(url, { signal })
}

export function thumbImage(src?: string | null) {
  return src ? archiveThumbUrl(src) : ''
}

export function smallThumbImage(src?: string | null) {
  return src ? archiveSmallThumbUrl(src) : ''
}

export function tinyThumbImage(src?: string | null) {
  return src ? archiveTinyThumbUrl(src) : ''
}

export function buildAtlasBrowse<TPoint extends MapPoint, TTopic extends Topic>({
  points,
  topics,
  filters,
  selectedPoint,
  selectedClusterId,
}: {
  points: readonly TPoint[]
  topics: readonly TTopic[]
  filters: AtlasFilters
  selectedPoint: TPoint | null
  selectedClusterId: string | null
}): AtlasBrowse<TPoint, TTopic> {
  const topicsById = new Map(topics.map((topic) => [topic.id, topic]))
  const sortedTopics = [...topics].sort((a, b) => b.postCount - a.postCount)
  const years = [...new Set(points.map((point) => point.year).filter(Boolean) as number[])].sort((a, b) => b - a)
  const categoryBounds: AtlasCategoryBounds = new Map()

  for (const point of points) {
    const categoryId = categoryFor(topicsById.get(point.topicId))?.id ?? 'heritage'
    const current = categoryBounds.get(categoryId) ?? { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    current.minX = Math.min(current.minX, point.x)
    current.maxX = Math.max(current.maxX, point.x)
    current.minY = Math.min(current.minY, point.y)
    current.maxY = Math.max(current.maxY, point.y)
    categoryBounds.set(categoryId, current)
  }

  const query = filters.search.trim().toLowerCase()
  const visible = points.filter((point) => {
    if (filters.topic !== 'all' && point.topicId !== filters.topic) return false
    if (filters.year !== 'all' && String(point.year) !== filters.year) return false
    if (filters.season !== 'all' && point.season !== filters.season) return false
    if (filters.imagesOnly && point.imageCount < 1) return false
    if (query && !`${point.title} ${point.excerpt}`.toLowerCase().includes(query)) return false
    return true
  })

  const relatedPointIds = selectedPoint ? new Set(
    points
      .filter((point) => point.id !== selectedPoint.id)
      .map((point) => ({ id: point.id, distance: (point.x - selectedPoint.x) ** 2 + (point.y - selectedPoint.y) ** 2 }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10)
      .map((point) => point.id),
  ) : new Set<string>()

  const selectedCluster = selectedClusterId ? topicsById.get(selectedClusterId) ?? null : null
  const selectedClusterPoints = selectedClusterId ? points.filter((point) => point.topicId === selectedClusterId) : []
  const selectedClusterStats = selectedClusterPoints.length ? (() => {
    const clusterYears = selectedClusterPoints.map((point) => point.year).filter(Boolean) as number[]
    const seasons = new Map<string, number>()
    for (const point of selectedClusterPoints) seasons.set(point.season, (seasons.get(point.season) ?? 0) + 1)
    const topSeason = [...seasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return {
      fromYear: clusterYears.length ? Math.min(...clusterYears) : null,
      toYear: clusterYears.length ? Math.max(...clusterYears) : null,
      topSeason,
      imageCount: selectedClusterPoints.reduce((sum, point) => sum + (point.imageCount > 0 ? 1 : 0), 0),
      representative: selectedClusterPoints.find((point) => point.image) ?? selectedClusterPoints[0]!,
    }
  })() : null

  return {
    topicsById,
    sortedTopics,
    years,
    categoryBounds,
    visible,
    visibleIds: new Set(visible.map((point) => point.id)),
    relatedPointIds,
    selectedCluster,
    selectedClusterPoints,
    selectedClusterStats,
  }
}
