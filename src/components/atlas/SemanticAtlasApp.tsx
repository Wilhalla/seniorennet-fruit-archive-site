import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ExternalLink, Home, Images, LocateFixed, Minus, Plus, RotateCw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { archiveAssetUrl } from '../../lib/assetUrls'
import { currentBrowserPath, writeBrowserPath } from '../../lib/browserHistory'
import { ATLAS_X_SPREAD, ATLAS_Y_SPREAD, MAX_ATLAS_SCALE, MIN_ATLAS_SCALE, atlasCategories, atlasCategoryColors, atlasTerritories, categoryFor, clamp, colorMix, fetchJson, formatDate, shortLabel, themeValue, thumbImage, topicDisplayLabel, topicKeywords, topicSearchText, type AtlasCategory as Category, type AtlasFilters as Filters, type AtlasViewMode as ViewMode, type MapPoint, type RenderCluster, type ScreenPoint, type Topic } from '../../lib/archiveAtlas'
import { generatedDataUrl } from '../../lib/sitePaths'

type Props = {
  initialPoints?: MapPoint[]
  initialTopics?: Topic[]
}

export default function SemanticAtlasApp({ initialPoints = [], initialTopics = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const minimapRef = useRef<HTMLCanvasElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const urlSelectionInitialized = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const scaleRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const [points, setPoints] = useState<MapPoint[]>(initialPoints)
  const [topics, setTopics] = useState<Topic[]>(initialTopics)
  const [loadingData, setLoadingData] = useState(initialPoints.length === 0 || initialTopics.length === 0)
  const [dataError, setDataError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>({ topic: 'all', year: 'all', season: 'all', imagesOnly: false, search: '' })
  const [viewMode, setViewMode] = useState<ViewMode>('points')
  const [hoverPoint, setHoverPoint] = useState<MapPoint | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null)
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 })
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    panRef.current = pan
  }, [pan])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const rect = canvas.getBoundingClientRect()
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top
      const scaleValue = scaleRef.current
      const panValue = panRef.current
      const nextScale = clamp(scaleValue * (event.deltaY > 0 ? 0.88 : 1.14), MIN_ATLAS_SCALE, MAX_ATLAS_SCALE)
      setPan({ x: mx - ((mx - panValue.x) / scaleValue) * nextScale, y: my - ((my - panValue.y) / scaleValue) * nextScale })
      setScale(nextScale)
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    if (!loadingData) return
    setDataError(null)
    Promise.all([
      fetchJson<MapPoint[]>(generatedDataUrl('map-points.json')),
      fetchJson<Topic[]>(generatedDataUrl('topics.json')),
    ])
      .then(([loadedPoints, loadedTopics]) => {
        setPoints(loadedPoints)
        setTopics(loadedTopics)
      })
      .catch((error) => {
        console.error(error)
        setDataError(error instanceof Error ? error.message : 'Atlasdata kon niet geladen worden')
      })
      .finally(() => setLoadingData(false))
  }, [loadingData])

  const topicsById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics])
  const sortedTopics = useMemo(() => [...topics].sort((a, b) => b.postCount - a.postCount), [topics])
  const years = useMemo(() => [...new Set(points.map((point) => point.year).filter(Boolean) as number[])].sort((a, b) => b - a), [points])
  const categoryBounds = useMemo(() => {
    const bounds = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>()
    for (const point of points) {
      const categoryId = categoryFor(topicsById.get(point.topicId))?.id ?? 'heritage'
      const current = bounds.get(categoryId) ?? { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      current.minX = Math.min(current.minX, point.x)
      current.maxX = Math.max(current.maxX, point.x)
      current.minY = Math.min(current.minY, point.y)
      current.maxY = Math.max(current.maxY, point.y)
      bounds.set(categoryId, current)
    }
    return bounds
  }, [points, topicsById])

  const visible = useMemo(() => {
    const query = filters.search.trim().toLowerCase()
    return points.filter((point) => {
      if (filters.topic !== 'all' && point.topicId !== filters.topic) return false
      if (filters.year !== 'all' && String(point.year) !== filters.year) return false
      if (filters.season !== 'all' && point.season !== filters.season) return false
      if (filters.imagesOnly && point.imageCount < 1) return false
      if (query && !`${point.title} ${point.excerpt}`.toLowerCase().includes(query)) return false
      return true
    })
  }, [points, filters])

  const visibleIds = useMemo(() => new Set(visible.map((point) => point.id)), [visible])

  const relatedPointIds = useMemo(() => {
    if (!selectedPoint) return new Set<string>()
    return new Set(
      points
        .filter((point) => point.id !== selectedPoint.id)
        .map((point) => ({ id: point.id, distance: (point.x - selectedPoint.x) ** 2 + (point.y - selectedPoint.y) ** 2 }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10)
        .map((point) => point.id),
    )
  }, [points, selectedPoint])

  const selectedCluster = selectedClusterId ? topicsById.get(selectedClusterId) : null
  const selectedClusterPoints = useMemo(() => selectedClusterId ? points.filter((point) => point.topicId === selectedClusterId) : [], [points, selectedClusterId])
  const selectedClusterStats = useMemo(() => {
    if (!selectedClusterPoints.length) return null
    const clusterYears = selectedClusterPoints.map((point) => point.year).filter(Boolean) as number[]
    const seasons = new Map<string, number>()
    for (const point of selectedClusterPoints) seasons.set(point.season, (seasons.get(point.season) ?? 0) + 1)
    const topSeason = [...seasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return {
      fromYear: Math.min(...clusterYears),
      toYear: Math.max(...clusterYears),
      topSeason,
      imageCount: selectedClusterPoints.reduce((sum, point) => sum + (point.imageCount > 0 ? 1 : 0), 0),
      representative: selectedClusterPoints.find((point) => point.image) ?? selectedClusterPoints[0],
    }
  }, [selectedClusterPoints])

  function colorFor(topicId: string) {
    const category = categoryFor(topicsById.get(topicId))
    return atlasCategoryColors[category?.id ?? 'heritage'] ?? atlasCategoryColors.heritage
  }

  function labelFor(topicId: string) {
    return topicDisplayLabel(topicsById.get(topicId))
  }

  function macroAtlasCoordinate(categoryId: string, rawX: number, rawY: number, rect = canvasSize): ScreenPoint {
    const territory = atlasTerritories[categoryId] ?? atlasTerritories.heritage
    const bounds = categoryBounds.get(categoryId)
    const spanX = bounds && Number.isFinite(bounds.maxX - bounds.minX) ? Math.max(0.001, bounds.maxX - bounds.minX) : 1
    const spanY = bounds && Number.isFinite(bounds.maxY - bounds.minY) ? Math.max(0.001, bounds.maxY - bounds.minY) : 1
    const nx = bounds ? (rawX - bounds.minX) / spanX : rawX
    const ny = bounds ? (rawY - bounds.minY) / spanY : rawY
    const x = clamp(territory.cx + (nx - 0.5) * territory.width, 0.035, 0.965)
    const y = clamp(territory.cy + (ny - 0.5) * territory.height, 0.055, 0.945)
    return { x: x * rect.width, y: y * rect.height }
  }

  function rawAtlasCoordinate(rawX: number, rawY: number, rect = canvasSize): ScreenPoint {
    const x = 0.5 + (rawX - 0.5) * ATLAS_X_SPREAD
    const y = 0.5 + (rawY - 0.5) * ATLAS_Y_SPREAD
    return { x: x * rect.width, y: y * rect.height }
  }

  function atlasPoint(point: MapPoint, rect = canvasSize): ScreenPoint {
    if (viewMode === 'clusters') return macroAtlasCoordinate(categoryIdFor(point.topicId), point.x, point.y, rect)
    return rawAtlasCoordinate(point.x, point.y, rect)
  }

  function screenPoint(point: MapPoint, rect = canvasSize): ScreenPoint {
    const p = atlasPoint(point, rect)
    return { x: p.x * scale + pan.x, y: p.y * scale + pan.y }
  }

  function updateAtlasUrl({ nextFilters = filters, point = selectedPoint, clusterId = selectedClusterId, mode = 'push' }: { nextFilters?: Filters; point?: MapPoint | null; clusterId?: string | null; mode?: 'push' | 'replace' } = {}) {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)

    if (nextFilters.topic === 'all') url.searchParams.delete('topic')
    else url.searchParams.set('topic', nextFilters.topic)
    if (nextFilters.year === 'all') url.searchParams.delete('year')
    else url.searchParams.set('year', nextFilters.year)
    if (nextFilters.season === 'all') url.searchParams.delete('season')
    else url.searchParams.set('season', nextFilters.season)
    if (nextFilters.imagesOnly) url.searchParams.set('images', '1')
    else url.searchParams.delete('images')
    if (nextFilters.search.trim()) url.searchParams.set('q', nextFilters.search.trim())
    else url.searchParams.delete('q')

    if (point) {
      url.searchParams.set('point', point.slug || point.id)
      url.searchParams.delete('cluster')
    } else {
      url.searchParams.delete('point')
      if (clusterId) url.searchParams.set('cluster', clusterId)
      else url.searchParams.delete('cluster')
    }

    const next = `${url.pathname}${url.search}${url.hash}`
    if (next === currentBrowserPath()) return
    writeBrowserPath(next, mode, { atlasPoint: point?.id ?? null, atlasCluster: clusterId ?? null, atlasFilters: nextFilters })
  }

  function setFiltersWithUrl(nextFilters: Filters, mode: 'push' | 'replace' = 'push', options: { clearPoint?: boolean; clusterId?: string | null } = {}) {
    setFilters(nextFilters)
    if (options.clearPoint) setSelectedPoint(null)
    if ('clusterId' in options) setSelectedClusterId(options.clusterId ?? null)
    updateAtlasUrl({ nextFilters, point: options.clearPoint ? null : selectedPoint, clusterId: 'clusterId' in options ? options.clusterId ?? null : selectedClusterId, mode })
  }

  function selectPoint(point: MapPoint, mode: 'push' | 'replace' = 'push') {
    setSelectedPoint(point)
    setSelectedClusterId(point.topicId)
    updateAtlasUrl({ point, clusterId: point.topicId, mode })
  }

  function clearSelection(mode: 'push' | 'replace' = 'push') {
    setSelectedPoint(null)
    setSelectedClusterId(null)
    updateAtlasUrl({ point: null, clusterId: null, mode })
  }

  function resetView() {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }

  function resetFilters() {
    const nextFilters = { topic: 'all', year: 'all', season: 'all', imagesOnly: false, search: '' }
    resetView()
    setSelectedPoint(null)
    setSelectedClusterId(null)
    setFilters(nextFilters)
    updateAtlasUrl({ nextFilters, point: null, clusterId: null })
  }

  useEffect(() => {
    if (!points.length || typeof window === 'undefined') return

    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search)
      const topicParam = params.get('topic')
      const yearParam = params.get('year')
      const seasonParam = params.get('season')
      const nextFilters: Filters = {
        topic: topicParam && topicsById.has(topicParam) ? topicParam : 'all',
        year: yearParam && /^\d{4}$/.test(yearParam) ? yearParam : 'all',
        season: ['lente', 'zomer', 'herfst', 'winter'].includes(seasonParam ?? '') ? seasonParam as string : 'all',
        imagesOnly: ['1', 'true', 'yes'].includes((params.get('images') ?? '').toLowerCase()),
        search: params.get('q') ?? '',
      }
      setFilters(nextFilters)

      const pointParam = params.get('point')
      const clusterParam = params.get('cluster')
      if (pointParam) {
        const point = points.find((candidate) => candidate.slug === pointParam || candidate.id === pointParam)
        if (point) {
          setSelectedPoint(point)
          setSelectedClusterId(point.topicId)
          return
        }
      }
      setSelectedPoint(null)
      if (clusterParam && topicsById.has(clusterParam)) setSelectedClusterId(clusterParam)
      else setSelectedClusterId(nextFilters.topic === 'all' ? null : nextFilters.topic)
    }

    if (!urlSelectionInitialized.current) {
      syncFromUrl()
      urlSelectionInitialized.current = true
    }

    const handlePopState = () => syncFromUrl()
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [points, topicsById])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      const context = canvas.getContext('2d')
      context?.setTransform(dpr, 0, 0, dpr, 0, 0)
      setCanvasSize({ width: rect.width, height: rect.height })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  function screenAtlasCoordinate(x: number, y: number, rect = canvasSize): ScreenPoint {
    const p = rawAtlasCoordinate(x, y, rect)
    return { x: p.x * scale + pan.x, y: p.y * scale + pan.y }
  }

  function topicScreenAtlasCoordinate(topicId: string, x: number, y: number, rect = canvasSize): ScreenPoint {
    const p = viewMode === 'clusters' ? macroAtlasCoordinate(categoryIdFor(topicId), x, y, rect) : rawAtlasCoordinate(x, y, rect)
    return { x: p.x * scale + pan.x, y: p.y * scale + pan.y }
  }

  function categoryIdFor(topicId: string) {
    return categoryFor(topicsById.get(topicId))?.id ?? 'heritage'
  }

  function clusterRadiusFor(count: number) {
    return clamp(12 + Math.sqrt(count) * 2.2, 18, 56)
  }

  function drawHexCell(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    context.beginPath()
    for (let i = 0; i < 6; i += 1) {
      const angle = Math.PI / 6 + i * Math.PI / 3
      const px = x + Math.cos(angle) * radius
      const py = y + Math.sin(angle) * radius
      if (i === 0) context.moveTo(px, py)
      else context.lineTo(px, py)
    }
    context.closePath()
  }

  function drawTechNode(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, selected = false) {
    const half = size / 2
    context.save()
    context.translate(x, y)
    context.rotate(Math.PI / 4)
    context.fillStyle = selected ? colorMix(color, 0.22) : 'rgba(253, 252, 252, 0.86)'
    context.strokeStyle = colorMix(color, selected ? 0.92 : 0.62)
    context.lineWidth = selected ? 2 : 1.35
    context.beginPath()
    context.rect(-half, -half, size, size)
    context.fill()
    context.stroke()
    context.restore()

    context.strokeStyle = colorMix(color, selected ? 0.72 : 0.38)
    context.lineWidth = selected ? 1.2 : 0.8
    context.beginPath()
    context.moveTo(x - size * 1.08, y)
    context.lineTo(x - half * 0.78, y)
    context.moveTo(x + half * 0.78, y)
    context.lineTo(x + size * 1.08, y)
    context.moveTo(x, y - size * 1.08)
    context.lineTo(x, y - half * 0.78)
    context.moveTo(x, y + half * 0.78)
    context.lineTo(x, y + size * 1.08)
    context.stroke()
  }

  type TopicPeak = { topicId: string; x: number; y: number; rawX: number; rawY: number; count: number; score: number }

  function topicDensityPeaks(rect: { width: number; height: number }, topicFilter?: string): TopicPeak[] {
    const gridW = 34
    const gridH = 24
    const cells = new Map<string, { topicId: string; cellX: number; cellY: number; count: number; sumX: number; sumY: number }>()
    for (const point of visible) {
      if (topicFilter && point.topicId !== topicFilter) continue
      const cellX = clamp(Math.floor(point.x * gridW), 0, gridW - 1)
      const cellY = clamp(Math.floor(point.y * gridH), 0, gridH - 1)
      const key = `${point.topicId}:${cellX}:${cellY}`
      const cell = cells.get(key) ?? { topicId: point.topicId, cellX, cellY, count: 0, sumX: 0, sumY: 0 }
      cell.count += 1
      cell.sumX += point.x
      cell.sumY += point.y
      cells.set(key, cell)
    }

    const minCount = topicFilter ? 2 : scale > 2.4 ? 4 : scale > 1.35 ? 7 : 12
    const maxPerTopic = topicFilter ? 8 : scale > 2.2 ? 2 : 1
    const minScreenDistance = topicFilter ? 48 : scale > 2.2 ? 76 : 112
    const peaks: TopicPeak[] = []
    const perTopic = new Map<string, number>()
    for (const cell of [...cells.values()].sort((a, b) => b.count - a.count)) {
      if (cell.count < minCount) continue
      const topicCount = perTopic.get(cell.topicId) ?? 0
      if (topicCount >= maxPerTopic) continue
      const rawX = cell.sumX / cell.count
      const rawY = cell.sumY / cell.count
      const p = topicScreenAtlasCoordinate(cell.topicId, rawX, rawY, rect)
      if (p.x < -120 || p.y < -120 || p.x > rect.width + 120 || p.y > rect.height + 120) continue
      const tooClose = peaks.some((peak) => peak.topicId === cell.topicId && (peak.x - p.x) ** 2 + (peak.y - p.y) ** 2 < minScreenDistance ** 2)
      if (tooClose) continue
      const selectedBoost = cell.topicId === (selectedPoint?.topicId ?? selectedClusterId) ? 4 : 1
      const topicSize = topicsById.get(cell.topicId)?.postCount ?? cell.count
      peaks.push({ topicId: cell.topicId, x: p.x, y: p.y, rawX, rawY, count: cell.count, score: cell.count * selectedBoost + Math.log1p(topicSize) })
      perTopic.set(cell.topicId, topicCount + 1)
    }
    return peaks.sort((a, b) => b.score - a.score)
  }

  function drawAtlasGrid(context: CanvasRenderingContext2D, rect: { width: number; height: number }) {
    context.save()
    context.lineCap = 'butt'
    const minorAlpha = scale > 1.25 ? 0.04 : 0.024
    const majorAlpha = scale > 1.25 ? 0.075 : 0.044
    for (let i = 0; i <= 20; i += 1) {
      const value = i / 20
      const major = i % 5 === 0
      context.strokeStyle = `rgba(31, 29, 27, ${major ? majorAlpha : minorAlpha})`
      context.lineWidth = major ? 1 : 0.65
      let a = screenAtlasCoordinate(value, 0, rect)
      let b = screenAtlasCoordinate(value, 1, rect)
      context.beginPath()
      context.moveTo(a.x, a.y)
      context.lineTo(b.x, b.y)
      context.stroke()
      a = screenAtlasCoordinate(0, value, rect)
      b = screenAtlasCoordinate(1, value, rect)
      context.beginPath()
      context.moveTo(a.x, a.y)
      context.lineTo(b.x, b.y)
      context.stroke()
    }
    if (scale > 2) {
      context.globalAlpha = 0.22
      context.fillStyle = themeValue('--color-gravel')
      context.font = '600 10px "DM Sans Variable", sans-serif'
      for (let x = 0; x < 4; x += 1) {
        for (let y = 0; y < 4; y += 1) {
          const p = screenAtlasCoordinate(x / 4 + 0.012, y / 4 + 0.025, rect)
          if (p.x > 0 && p.y > 0 && p.x < rect.width - 20 && p.y < rect.height - 10) context.fillText(`${String.fromCharCode(65 + x)}${y + 1}`, p.x, p.y)
        }
      }
    }
    context.restore()
  }

  function drawTerritoryFrames(context: CanvasRenderingContext2D, rect: { width: number; height: number }) {
    const counts = new Map<string, number>()
    for (const point of visible) {
      const categoryId = categoryIdFor(point.topicId)
      counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1)
    }

    context.save()
    context.textBaseline = 'top'
    for (const category of atlasCategories) {
      const territory = atlasTerritories[category.id]
      const count = counts.get(category.id) ?? 0
      if (!territory || count < 1) continue
      const color = atlasCategoryColors[category.id] ?? atlasCategoryColors.heritage
      const left = (territory.cx - territory.width / 2) * rect.width * scale + pan.x
      const top = (territory.cy - territory.height / 2) * rect.height * scale + pan.y
      const width = territory.width * rect.width * scale
      const height = territory.height * rect.height * scale
      if (left > rect.width + 80 || top > rect.height + 80 || left + width < -80 || top + height < -80) continue

      context.fillStyle = colorMix(color, viewMode === 'clusters' ? 0.025 : 0.014)
      context.strokeStyle = colorMix(color, viewMode === 'clusters' ? 0.24 : 0.14)
      context.lineWidth = category.id === (selectedCluster?.id ? categoryIdFor(selectedCluster.id) : selectedPoint?.topicId ? categoryIdFor(selectedPoint.topicId) : '') ? 1.6 : 1
      context.setLineDash([7, 7])
      context.beginPath()
      context.rect(left, top, width, height)
      context.fill()
      context.stroke()
      context.setLineDash([])

      if (scale < 4.2) {
        const label = category.label.toUpperCase()
        context.fillStyle = colorMix(color, 0.92)
        context.font = '700 11px "DM Sans Variable", sans-serif'
        context.fillText(label, left + 12, top + 10)
        context.fillStyle = themeValue('--color-gravel')
        context.globalAlpha = 0.7
        context.font = '500 10px "DM Sans Variable", sans-serif'
        context.fillText(`${count.toLocaleString('nl-BE')} berichten`, left + 12, top + 26)
        context.globalAlpha = 1
      }
    }
    context.restore()
  }

  function drawDensityTerrain(context: CanvasRenderingContext2D, rect: { width: number; height: number }) {
    const gridW = 56
    const gridH = 36
    const grids = new Map<string, Float32Array>()
    for (const point of visible) {
      const categoryId = categoryIdFor(point.topicId)
      const grid = grids.get(categoryId) ?? new Float32Array(gridW * gridH)
      const cx = clamp(Math.floor(point.x * gridW), 0, gridW - 1)
      const cy = clamp(Math.floor(point.y * gridH), 0, gridH - 1)
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -2; dy <= 2; dy += 1) {
          const x = cx + dx
          const y = cy + dy
          if (x < 0 || y < 0 || x >= gridW || y >= gridH) continue
          const distance = Math.hypot(dx, dy)
          if (distance > 2.25) continue
          grid[y * gridW + x] += 1 / (1 + distance * 1.35)
        }
      }
      grids.set(categoryId, grid)
    }

    context.save()
    context.globalCompositeOperation = 'multiply'
    for (const [categoryId, grid] of grids) {
      let max = 0
      for (const value of grid) max = Math.max(max, value)
      if (max <= 0) continue
      const color = atlasCategoryColors[categoryId] ?? atlasCategoryColors.heritage
      for (let y = 0; y < gridH; y += 1) {
        for (let x = 0; x < gridW; x += 1) {
          const value = grid[y * gridW + x]
          if (value < Math.max(1.35, max * 0.1)) continue
          const rawX = (x + 0.5) / gridW
          const rawY = (y + 0.5) / gridH
          const p = screenAtlasCoordinate(rawX, rawY, rect)
          if (p.x < -140 || p.y < -140 || p.x > rect.width + 140 || p.y > rect.height + 140) continue
          const strength = value / max
          const radius = clamp((rect.width * ATLAS_X_SPREAD / gridW) * scale * (2.8 + strength * 2.2), 18, viewMode === 'density' ? 120 : 82)
          const alpha = clamp(strength * (viewMode === 'density' ? 0.095 : 0.055), 0.008, viewMode === 'density' ? 0.11 : 0.07)
          const gradient = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
          gradient.addColorStop(0, colorMix(color, alpha))
          gradient.addColorStop(0.62, colorMix(color, alpha * 0.38))
          gradient.addColorStop(1, colorMix(color, 0))
          context.fillStyle = gradient
          context.beginPath()
          context.arc(p.x, p.y, radius, 0, Math.PI * 2)
          context.fill()
        }
      }
    }
    context.restore()
  }

  function drawSelectedTopicIslands(context: CanvasRenderingContext2D, rect: { width: number; height: number }) {
    const topicId = selectedPoint?.topicId ?? selectedClusterId
    if (!topicId) return
    const color = colorFor(topicId)
    context.save()
    for (const peak of topicDensityPeaks(rect, topicId).slice(0, 8)) {
      const radius = clamp(Math.sqrt(peak.count) * 18 * Math.sqrt(scale), 34, 130)
      const gradient = context.createRadialGradient(peak.x, peak.y, 0, peak.x, peak.y, radius)
      gradient.addColorStop(0, colorMix(color, 0.18))
      gradient.addColorStop(0.7, colorMix(color, 0.05))
      gradient.addColorStop(1, colorMix(color, 0))
      context.fillStyle = gradient
      context.beginPath()
      context.arc(peak.x, peak.y, radius, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  function visibleRenderClusters(rect: { width: number; height: number }): RenderCluster[] {
    const groups = new Map<string, { x: number; y: number; count: number }>()
    for (const point of visible) {
      const p = screenPoint(point, rect)
      if (p.x < -160 || p.y < -160 || p.x > rect.width + 160 || p.y > rect.height + 160) continue
      const group = groups.get(point.topicId) ?? { x: 0, y: 0, count: 0 }
      group.x += p.x
      group.y += p.y
      group.count += 1
      groups.set(point.topicId, group)
    }
    return [...groups.entries()]
      .map(([topicId, group]) => ({ x: group.x / group.count, y: group.y / group.count, count: group.count, topicId }))
      .sort((a, b) => b.count - a.count)
  }

  function drawPointClusters(context: CanvasRenderingContext2D, rect: { width: number; height: number }) {
    const clusters = visibleRenderClusters(rect)
    const selectedTopic = selectedPoint?.topicId ?? selectedClusterId
    const renderedClusters = viewMode === 'clusters' && !selectedTopic ? clusters.slice(0, 34) : clusters
    const maxCount = Math.max(1, ...renderedClusters.map((cluster) => cluster.count))
    const clusterTopicIds = new Set(renderedClusters.map((cluster) => cluster.topicId))

    const cell = clamp(33 / Math.sqrt(scale), 20, 38)
    const hexes = new Map<string, { x: number; y: number; count: number; topics: Map<string, number> }>()
    for (const point of visible) {
      if (!clusterTopicIds.has(point.topicId)) continue
      const p = screenPoint(point, rect)
      if (p.x < -80 || p.y < -80 || p.x > rect.width + 80 || p.y > rect.height + 80) continue
      const qx = Math.round(p.x / (cell * 0.86))
      const qy = Math.round((p.y - (qx % 2) * cell * 0.5) / cell)
      const key = `${qx}:${qy}`
      const hex = hexes.get(key) ?? { x: qx * cell * 0.86, y: qy * cell + (qx % 2) * cell * 0.5, count: 0, topics: new Map<string, number>() }
      hex.count += 1
      hex.topics.set(point.topicId, (hex.topics.get(point.topicId) ?? 0) + 1)
      hexes.set(key, hex)
    }

    context.save()
    context.lineJoin = 'miter'
    context.textBaseline = 'middle'

    const hexValues = [...hexes.values()]
      .map((hex) => ({ ...hex, topicId: [...hex.topics.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'topic-overig' }))
      .sort((a, b) => a.count - b.count)
    const maxHexCount = Math.max(1, ...hexValues.map((hex) => hex.count))

    for (const hex of hexValues) {
      const color = colorFor(hex.topicId)
      const selected = hex.topicId === selectedTopic
      const strength = clamp(hex.count / maxHexCount, 0.08, 1)
      context.fillStyle = colorMix(color, selected ? 0.28 : 0.045 + strength * 0.13)
      context.strokeStyle = colorMix(color, selected ? 0.52 : 0.10 + strength * 0.16)
      context.lineWidth = selected ? 1.2 : 0.7
      drawHexCell(context, hex.x, hex.y, cell * 0.52)
      context.fill()
      context.stroke()
    }

    context.globalAlpha = 0.58
    context.lineWidth = 0.85
    context.setLineDash([3, 5])
    for (const cluster of renderedClusters) {
      const neighbours = renderedClusters
        .filter((candidate) => candidate.topicId !== cluster.topicId)
        .map((candidate) => ({ candidate, distance: (candidate.x - cluster.x) ** 2 + (candidate.y - cluster.y) ** 2 }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 2)
      for (const { candidate, distance } of neighbours) {
        if (distance > 240 ** 2) continue
        context.strokeStyle = colorMix(colorFor(cluster.topicId), 0.18)
        context.beginPath()
        context.moveTo(cluster.x, cluster.y)
        context.lineTo(candidate.x, candidate.y)
        context.stroke()
      }
    }
    context.setLineDash([])
    context.globalAlpha = 1

    context.textAlign = 'center'
    context.font = '700 10px "DM Sans Variable", sans-serif'
    for (const cluster of [...renderedClusters].reverse()) {
      const color = colorFor(cluster.topicId)
      const selected = cluster.topicId === selectedTopic
      const prominence = clamp(cluster.count / maxCount, 0.18, 1)
      const size = clamp(10 + prominence * 11 + (selected ? 7 : 0), 12, 28)
      drawTechNode(context, cluster.x, cluster.y, size, color, selected)

      if (cluster.count >= 58 || selected) {
        const text = cluster.count > 999 ? `${Math.round(cluster.count / 100) / 10}k` : String(cluster.count)
        const w = Math.max(24, context.measureText(text).width + 12)
        context.fillStyle = 'rgba(253, 252, 252, 0.90)'
        context.strokeStyle = 'rgba(31, 29, 27, 0.11)'
        context.lineWidth = 1
        context.beginPath()
        context.rect(cluster.x - w / 2, cluster.y + size * 0.72, w, 18)
        context.fill()
        context.stroke()
        context.fillStyle = themeValue('--color-obsidian')
        context.globalAlpha = 0.82
        context.fillText(text, cluster.x, cluster.y + size * 0.72 + 9.5)
        context.globalAlpha = 1
      }
    }

    const placed: Array<{ x: number; y: number; width: number; height: number }> = []
    const labelLimit = selectedTopic ? 14 : viewMode === 'clusters' ? 10 : 7
    context.font = '700 12px "DM Sans Variable", sans-serif'
    context.textAlign = 'left'
    for (const cluster of renderedClusters.slice(0, labelLimit * 2)) {
      if (placed.length >= labelLimit) break
      const label = shortLabel(labelFor(cluster.topicId), 25)
      const meta = `${cluster.count.toLocaleString('nl-BE')} berichten`
      const width = Math.min(250, Math.max(context.measureText(label).width + 38, context.measureText(meta).width + 38))
      const height = 42
      let x = clamp(cluster.x + 16, 10, rect.width - width - 10)
      let y = clamp(cluster.y - height / 2, 10, rect.height - height - 10)
      let fits = false
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const overlaps = placed.some((box) => x < box.x + box.width + 10 && x + width + 10 > box.x && y < box.y + box.height + 10 && y + height + 10 > box.y)
        if (!overlaps) { fits = true; break }
        const side = attempt % 2 === 0 ? -1 : 1
        x = clamp(cluster.x + side * (width * 0.42 + 28), 10, rect.width - width - 10)
        y = clamp(cluster.y - height / 2 + Math.floor(attempt / 2) * 30, 10, rect.height - height - 10)
      }
      if (!fits) continue
      placed.push({ x, y, width, height })

      const color = colorFor(cluster.topicId)
      context.strokeStyle = colorMix(color, cluster.topicId === selectedTopic ? 0.64 : 0.26)
      context.lineWidth = cluster.topicId === selectedTopic ? 1.5 : 1
      context.fillStyle = 'rgba(253, 252, 252, 0.94)'
      context.beginPath()
      context.rect(x, y, width, height)
      context.fill()
      context.stroke()
      context.fillStyle = color
      context.fillRect(x + 12, y + 12, 7, 7)
      context.fillStyle = themeValue('--color-obsidian')
      context.globalAlpha = 0.94
      context.font = '700 12px "DM Sans Variable", sans-serif'
      context.fillText(label, x + 27, y + 15)
      context.globalAlpha = 0.58
      context.font = '500 10px "DM Sans Variable", sans-serif'
      context.fillText(meta, x + 27, y + 30)
      context.globalAlpha = 1

      context.strokeStyle = colorMix(color, 0.28)
      context.lineWidth = 0.8
      context.beginPath()
      context.moveTo(cluster.x, cluster.y)
      context.lineTo(x + (cluster.x < x ? 0 : width), y + height / 2)
      context.stroke()
    }
    context.restore()
  }

  function drawRelatedLinks(context: CanvasRenderingContext2D, rect: { width: number; height: number }) {
    if (!selectedPoint) return
    const from = screenPoint(selectedPoint, rect)
    context.save()
    context.strokeStyle = 'rgba(31, 29, 27, 0.13)'
    context.lineWidth = 0.8
    for (const point of visible) {
      if (!relatedPointIds.has(point.id)) continue
      const to = screenPoint(point, rect)
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      context.stroke()
    }
    context.restore()
  }

  function drawPeakLabels(context: CanvasRenderingContext2D, rect: { width: number; height: number }) {
    const labelLimit = viewMode === 'density' ? (selectedClusterId || selectedPoint ? 8 : 5) : scale > 2.4 ? 22 : scale > 1.35 ? 14 : 10
    const peaks = topicDensityPeaks(rect).slice(0, labelLimit * 3)
    const placed: Array<{ x: number; y: number; width: number; height: number }> = []
    const labelCounts = new Map<string, number>()
    context.save()
    context.font = '700 12px "DM Sans Variable", sans-serif'
    context.textBaseline = 'middle'
    for (const peak of peaks) {
      if (placed.length >= labelLimit) break
      const label = shortLabel(labelFor(peak.topicId), 22)
      const currentCount = labelCounts.get(label) ?? 0
      const maxPerLabel = scale > 2.2 ? 2 : 1
      if (currentCount >= maxPerLabel) continue
      const textWidth = context.measureText(label).width
      const width = Math.min(rect.width - 16, textWidth + 28)
      const height = 28
      let x = clamp(peak.x - width / 2, 8, rect.width - width - 8)
      let y = clamp(peak.y - height / 2, 8, rect.height - height - 8)
      let blocked = false
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const overlaps = placed.some((box) => x < box.x + box.width + 8 && x + width + 8 > box.x && y < box.y + box.height + 8 && y + height + 8 > box.y)
        if (!overlaps) { blocked = false; break }
        blocked = true
        y = clamp(y + 34, 8, rect.height - height - 8)
      }
      if (blocked && placed.some((box) => x < box.x + box.width + 8 && x + width + 8 > box.x && y < box.y + box.height + 8 && y + height + 8 > box.y)) continue
      placed.push({ x, y, width, height })
      labelCounts.set(label, currentCount + 1)
      context.fillStyle = 'rgba(253, 252, 252, 0.9)'
      context.strokeStyle = colorMix(colorFor(peak.topicId), peak.topicId === (selectedPoint?.topicId ?? selectedClusterId) ? 0.42 : 0.18)
      context.lineWidth = peak.topicId === (selectedPoint?.topicId ?? selectedClusterId) ? 1.4 : 1
      context.beginPath()
      context.roundRect(x, y, width, height, 999)
      context.fill()
      context.stroke()
      context.globalAlpha = 0.9
      context.fillStyle = themeValue('--color-obsidian')
      context.fillText(label, x + 14, y + height / 2)
      context.globalAlpha = 1
    }
    context.restore()
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !canvasSize.width || !canvasSize.height) return
    const rect = canvasSize
    context.clearRect(0, 0, rect.width, rect.height)

    drawAtlasGrid(context, rect)
    if (viewMode === 'clusters') drawTerritoryFrames(context, rect)
    if (viewMode === 'density') drawDensityTerrain(context, rect)
    if (selectedPoint || selectedClusterId) drawSelectedTopicIslands(context, rect)
    drawRelatedLinks(context, rect)

    const shouldDrawIndividualPoints = scale >= 1.65

    context.save()
    if (shouldDrawIndividualPoints) {
      for (const point of points) {
        if (visibleIds.has(point.id)) continue
        const p = screenPoint(point, rect)
        if (p.x < -10 || p.y < -10 || p.x > rect.width + 10 || p.y > rect.height + 10) continue
        const ghostSize = clamp(1.2 + scale * 0.18, 1.5, 3.2)
        context.fillStyle = themeValue('--color-slate-ink')
        context.globalAlpha = selectedPoint || selectedClusterId ? 0.018 : 0.035
        context.fillRect(p.x - ghostSize / 2, p.y - ghostSize / 2, ghostSize, ghostSize)
      }
    }

    if (viewMode !== 'density') {
      if (shouldDrawIndividualPoints) {
        for (const point of visible) {
          const p = screenPoint(point, rect)
          if (p.x < -12 || p.y < -12 || p.x > rect.width + 12 || p.y > rect.height + 12) continue
          const isSelected = point.id === selectedPoint?.id
          const isRelated = relatedPointIds.has(point.id)
          const isSameCluster = point.topicId === (selectedPoint?.topicId ?? selectedClusterId)
          const hasFocus = Boolean(selectedPoint || selectedClusterId)
          const baseSize = clamp(3.4 + scale * 0.58, 4.5, 11)
          const size = isSelected ? baseSize + 5 : isRelated ? baseSize + 2.5 : point.imageCount > 0 ? baseSize + 1.2 : baseSize
          const alpha = !hasFocus ? 0.62 : isSelected || isRelated ? 0.96 : isSameCluster ? 0.68 : 0.13
          const color = colorFor(point.topicId)
          context.fillStyle = color
          context.globalAlpha = alpha
          context.fillRect(p.x - size / 2, p.y - size / 2, size, size)
          if (point.imageCount > 0 || isSelected || isRelated || scale > 5.5) {
            context.globalAlpha = Math.min(1, alpha + 0.18)
            context.strokeStyle = isSelected ? themeValue('--color-obsidian') : colorMix(color, 0.7)
            context.lineWidth = isSelected ? 1.4 : 0.75
            context.strokeRect(p.x - size / 2, p.y - size / 2, size, size)
          }
        }
      } else {
        context.restore()
        drawPointClusters(context, rect)
        context.save()
      }
    }

    for (const point of [selectedPoint, hoverPoint]) {
      if (!point) continue
      const p = screenPoint(point, rect)
      const selected = point === selectedPoint
      const color = colorFor(point.topicId)
      context.globalAlpha = 1
      context.strokeStyle = selected ? themeValue('--color-obsidian') : color
      context.fillStyle = colorMix(color, selected ? 0.12 : 0.08)
      context.lineWidth = selected ? 2 : 1.35
      const size = selected ? 30 : 22
      context.beginPath()
      context.rect(p.x - size / 2, p.y - size / 2, size, size)
      context.fill()
      context.stroke()
      context.beginPath()
      context.moveTo(p.x - size * 0.85, p.y)
      context.lineTo(p.x - size * 0.35, p.y)
      context.moveTo(p.x + size * 0.35, p.y)
      context.lineTo(p.x + size * 0.85, p.y)
      context.moveTo(p.x, p.y - size * 0.85)
      context.lineTo(p.x, p.y - size * 0.35)
      context.moveTo(p.x, p.y + size * 0.35)
      context.lineTo(p.x, p.y + size * 0.85)
      context.stroke()
    }
    context.restore()
    if (viewMode === 'density' || shouldDrawIndividualPoints) drawPeakLabels(context, rect)
  }, [points, visible, visibleIds, relatedPointIds, topicsById, hoverPoint, selectedPoint, selectedClusterId, viewMode, scale, pan, canvasSize])

  const showMiniMap = scale > 1.08

  useEffect(() => {
    const canvas = minimapRef.current
    if (!canvas || !showMiniMap || !canvasSize.width || !canvasSize.height) return

    const bounds = canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return

    const dpr = Math.max(1, window.devicePixelRatio || 1)
    canvas.width = Math.round(bounds.width * dpr)
    canvas.height = Math.round(bounds.height * dpr)

    const context = canvas.getContext('2d')
    if (!context) return

    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, bounds.width, bounds.height)

    const miniRect = { width: bounds.width, height: bounds.height }

    context.save()
    context.fillStyle = 'rgba(253, 252, 252, 0.72)'
    context.fillRect(0, 0, bounds.width, bounds.height)

    for (let i = 0; i <= 4; i += 1) {
      const x = (0.5 + (i / 4 - 0.5) * ATLAS_X_SPREAD) * bounds.width
      const y = (0.5 + (i / 4 - 0.5) * ATLAS_Y_SPREAD) * bounds.height
      context.strokeStyle = 'rgba(31, 29, 27, 0.08)'
      context.lineWidth = 0.6
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, bounds.height)
      context.stroke()
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(bounds.width, y)
      context.stroke()
    }

    for (const point of points) {
      const p = atlasPoint(point, miniRect)
      context.fillStyle = themeValue('--color-slate-ink')
      context.globalAlpha = visibleIds.has(point.id) ? 0.18 : 0.07
      context.beginPath()
      context.arc(p.x, p.y, visibleIds.has(point.id) ? 0.8 : 0.55, 0, Math.PI * 2)
      context.fill()
    }

    for (const point of visible) {
      const p = atlasPoint(point, miniRect)
      const isSelected = point.id === selectedPoint?.id
      const isSameCluster = point.topicId === (selectedPoint?.topicId ?? selectedClusterId)
      context.fillStyle = colorFor(point.topicId)
      context.globalAlpha = isSelected ? 1 : isSameCluster ? 0.78 : 0.42
      context.beginPath()
      context.arc(p.x, p.y, isSelected ? 2.7 : 1.15, 0, Math.PI * 2)
      context.fill()
    }

    context.globalAlpha = 1
    const viewX = (-pan.x / scale / canvasSize.width) * bounds.width
    const viewY = (-pan.y / scale / canvasSize.height) * bounds.height
    const viewWidth = bounds.width / scale
    const viewHeight = bounds.height / scale
    const x1 = clamp(viewX, 0, bounds.width)
    const y1 = clamp(viewY, 0, bounds.height)
    const x2 = clamp(viewX + viewWidth, 0, bounds.width)
    const y2 = clamp(viewY + viewHeight, 0, bounds.height)
    const boxWidth = Math.max(5, x2 - x1)
    const boxHeight = Math.max(5, y2 - y1)

    context.fillStyle = 'rgba(31, 29, 27, 0.08)'
    context.strokeStyle = themeValue('--color-obsidian')
    context.lineWidth = 1.6
    context.beginPath()
    context.roundRect(x1, y1, boxWidth, boxHeight, 2)
    context.fill()
    context.stroke()
    context.restore()
  }, [points, visible, visibleIds, selectedPoint, selectedClusterId, showMiniMap, scale, pan, canvasSize, topicsById])

  function nearestPoint(event: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    let best: MapPoint | null = null
    const hitRadius = clamp(16 + scale * 1.2, 18, 34)
    let bestDistance = hitRadius * hitRadius
    for (const point of visible) {
      const p = screenPoint(point, { width: rect.width, height: rect.height })
      const distance = (p.x - x) ** 2 + (p.y - y) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        best = point
      }
    }
    return best
  }

  function nearestCluster(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    return visibleRenderClusters({ width: rect.width, height: rect.height }).find((cluster) => {
      const radius = clusterRadiusFor(cluster.count) + 18
      return (cluster.x - x) ** 2 + (cluster.y - y) ** 2 < radius ** 2
    }) ?? topicDensityPeaks({ width: rect.width, height: rect.height }).find((peak) => (peak.x - x) ** 2 + (peak.y - y) ** 2 < 48 * 48) ?? null
  }

  function updateHover(event: React.MouseEvent<HTMLCanvasElement>) {
    if (dragging) return
    const point = nearestPoint(event)
    setHoverPoint(point)
    if (!point) return
    const tooltip = tooltipRef.current
    const offset = 14
    const width = tooltip?.offsetWidth ?? 360
    const height = tooltip?.offsetHeight ?? 130
    setTooltipPosition({
      left: Math.min(event.clientX + offset, Math.max(offset, window.innerWidth - width - offset)),
      top: Math.min(event.clientY + offset, Math.max(offset, window.innerHeight - height - offset)),
    })
  }

  function selectTopic(topicId: string, isolate = false) {
    const nextFilters = isolate ? { ...filters, topic: topicId } : filters
    setSelectedPoint(null)
    setSelectedClusterId(topicId)
    if (isolate) setFilters(nextFilters)
    updateAtlasUrl({ nextFilters, point: null, clusterId: topicId })
  }

  function isolateSelectedCluster() {
    if (!selectedClusterId) return
    const nextFilters = { ...filters, topic: selectedClusterId }
    setFiltersWithUrl(nextFilters, 'push', { clearPoint: true, clusterId: selectedClusterId })
  }

  const startpointTopics = useMemo(() => {
    const used = new Set<string>()
    const items = atlasCategories
      .map((category) => {
        const topic = sortedTopics.find((candidate) => !used.has(candidate.id) && category.match.test(topicSearchText(candidate)))
        if (!topic) return null
        used.add(topic.id)
        const point = points.find((candidate) => candidate.topicId === topic.id && candidate.image) ?? points.find((candidate) => candidate.topicId === topic.id)
        return { category, topic, point, Icon: category.Icon }
      })
      .filter(Boolean)
    return items.slice(0, 6) as Array<{ category: Category; topic: Topic; point?: MapPoint; Icon: Category['Icon'] }>
  }, [points, sortedTopics])

  const visibleStatus = `${visible.length.toLocaleString('nl-BE')} van ${points.length.toLocaleString('nl-BE')} berichten zichtbaar`
  const hasDetailSelection = Boolean(selectedPoint || selectedCluster)

  return (
    <section className="mx-auto w-full max-w-[120rem] px-5 py-6 text-obsidian max-md:px-4" data-atlas-root>
      {loadingData && <div className="site-loader site-loader--active" role="status" aria-live="polite" aria-label="Atlas laden"><div className="site-loader__mark" aria-hidden="true"></div><div className="site-loader__text"><span>Daniel Willaeys</span><small>atlas laden</small></div></div>}
      {dataError && (
        <div className="mb-4 border-y border-chalk bg-powder px-4 py-3 text-sm text-obsidian" role="alert">
          <strong className="font-medium">Atlasdata niet geladen.</strong> Controleer of de gegenereerde JSON-bestanden beschikbaar zijn. <span className="font-mono text-xs">{dataError}</span>
        </div>
      )}

      <header className="grid items-end gap-5 border-b border-chalk pb-5 lg:grid-cols-[1fr_22rem]">
        <div>
          <h1 className="m-0 font-heading text-[clamp(2.25rem,5vw,4.75rem)] font-light leading-[0.98] tracking-[-0.04em]">Atlas</h1>
        </div>
        <label className="relative block">
          <span className="sr-only">Zoek in de atlas</span>
          <Input className="h-11 w-full rounded-none border-0 border-b border-chalk bg-transparent px-0 pr-9 shadow-none focus-visible:ring-0" value={filters.search} onChange={(event) => setFiltersWithUrl({ ...filters, search: event.target.value }, 'replace')} type="search" placeholder="Zoek in mijn archief…" />
          <Search className="absolute right-0 top-1/2 size-4 -translate-y-1/2 text-gravel" aria-hidden="true" />
        </label>
      </header>

      <div className={`grid gap-5 pt-5 ${hasDetailSelection ? 'lg:grid-cols-[14rem_minmax(0,1fr)_20rem]' : 'lg:grid-cols-[14rem_minmax(0,1fr)]'}`}>
        <aside className="self-start lg:sticky lg:top-20" aria-label="Atlas uitleg en filters">
          <div className="space-y-5 divide-y divide-chalk text-sm">
            <section className="pb-5">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-gravel">Hoe lezen</p>
              <ol className="grid list-none gap-3 p-0">
                <li><strong className="block font-medium">1. Thema-raster</strong><span className="text-gravel">Elke cel hoort bij een inhoudelijk gebied.</span></li>
                <li><strong className="block font-medium">2. Nabijheid</strong><span className="text-gravel">Dichterbij betekent vaker verwant.</span></li>
                <li><strong className="block font-medium">3. Inzoomen</strong><span className="text-gravel">Zoom door naar losse berichten.</span></li>
              </ol>
            </section>

            <section className="py-5">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-gravel">Filters</p>
              <div className="grid gap-3">
                <label className="grid gap-1 text-sm text-gravel">Thema<Select value={filters.topic} onValueChange={(value) => setFiltersWithUrl({ ...filters, topic: value }, 'push', { clearPoint: true, clusterId: value === 'all' ? null : value })}><SelectTrigger className="rounded-none border-0 border-b border-chalk bg-transparent px-0 shadow-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle thema’s</SelectItem>{sortedTopics.map((topic) => <SelectItem key={topic.id} value={topic.id}>{topicDisplayLabel(topic)} ({topic.postCount})</SelectItem>)}</SelectContent></Select></label>
                <label className="grid gap-1 text-sm text-gravel">Jaar<Select value={filters.year} onValueChange={(value) => setFiltersWithUrl({ ...filters, year: value })}><SelectTrigger className="rounded-none border-0 border-b border-chalk bg-transparent px-0 shadow-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle jaren</SelectItem>{years.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent></Select></label>
                <label className="grid gap-1 text-sm text-gravel">Seizoen<Select value={filters.season} onValueChange={(value) => setFiltersWithUrl({ ...filters, season: value })}><SelectTrigger className="rounded-none border-0 border-b border-chalk bg-transparent px-0 shadow-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle seizoenen</SelectItem><SelectItem value="lente">lente</SelectItem><SelectItem value="zomer">zomer</SelectItem><SelectItem value="herfst">herfst</SelectItem><SelectItem value="winter">winter</SelectItem></SelectContent></Select></label>
                <button className={`mt-1 flex min-h-9 items-center justify-between border border-chalk px-3 text-left text-sm transition-colors ${filters.imagesOnly ? 'bg-obsidian text-eggshell' : 'bg-eggshell text-obsidian hover:bg-powder'}`} type="button" onClick={() => setFiltersWithUrl({ ...filters, imagesOnly: !filters.imagesOnly })}>Alleen met beelden <Images className="size-4" aria-hidden="true" /></button>
                <Button className="mt-1 justify-start rounded-none bg-transparent px-0 text-obsidian shadow-none hover:!bg-transparent hover:text-obsidian" variant="ghost" type="button" onClick={resetFilters}>Reset kaart <RotateCw className="size-4" aria-hidden="true" /></Button>
              </div>
            </section>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gravel">
            <span>Begin op themaniveau, klik een cluster, zoom daarna door naar berichten.</span>
            <Badge className="rounded-none bg-transparent px-0 py-0 font-mono text-[11px] text-gravel shadow-none" variant="secondary">{visibleStatus}</Badge>
          </div>

          <div className="relative h-[66vh] min-h-[34rem] max-h-[52rem] overflow-hidden border border-chalk bg-[radial-gradient(circle_at_28%_18%,rgba(139,90,43,0.10),transparent_28%),radial-gradient(circle_at_75%_70%,rgba(86,122,75,0.10),transparent_24%),linear-gradient(180deg,rgba(249,247,244,0.92),rgba(253,252,252,0.66))] shadow-[0_22px_80px_rgba(31,29,27,0.08)]">
            <div className="absolute left-4 top-4 z-10 flex items-center gap-1" aria-label="Kaartbediening">
              <Button className="size-9 rounded-full bg-eggshell/85 p-0 shadow-none backdrop-blur hover:bg-powder" variant="ghost" size="icon" type="button" onClick={resetView} aria-label="Pas kaart in"><Home className="size-4" /></Button>
              <Button className="size-9 rounded-full bg-eggshell/85 p-0 shadow-none backdrop-blur hover:bg-powder" variant="ghost" size="icon" type="button" onClick={() => setScale((value) => clamp(value * 1.28, MIN_ATLAS_SCALE, MAX_ATLAS_SCALE))} aria-label="Inzoomen"><Plus className="size-4" /></Button>
              <Button className="size-9 rounded-full bg-eggshell/85 p-0 shadow-none backdrop-blur hover:bg-powder" variant="ghost" size="icon" type="button" onClick={() => setScale((value) => clamp(value / 1.28, MIN_ATLAS_SCALE, MAX_ATLAS_SCALE))} aria-label="Uitzoomen"><Minus className="size-4" /></Button>
              <Button className="size-9 rounded-full bg-eggshell/85 p-0 shadow-none backdrop-blur hover:bg-powder" variant="ghost" size="icon" type="button" onClick={resetView} aria-label="Centreer kaart"><LocateFixed className="size-4" /></Button>
            </div>

            <div className="absolute right-4 top-4 z-10 flex bg-eggshell/85 text-xs backdrop-blur" aria-label="Weergave">
              {(['points', 'clusters', 'density'] as ViewMode[]).map((mode) => (
                <button key={mode} className={`px-3 py-2 ${viewMode === mode ? 'bg-obsidian text-eggshell' : 'text-gravel hover:text-obsidian'}`} type="button" onClick={() => setViewMode(mode)}>
                  {mode === 'points' ? 'Punten' : mode === 'clusters' ? 'Thema’s' : 'Dichtheid'}
                </button>
              ))}
            </div>

            <canvas
              className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
              ref={canvasRef}
              aria-label="Kaart van het archief"
              onMouseMove={updateHover}
              onMouseLeave={() => setHoverPoint(null)}
              onClick={(event) => {
                const point = nearestPoint(event)
                if (point) { selectPoint(point); return }
                const cluster = nearestCluster(event)
                if (cluster) selectTopic(cluster.topicId)
              }}
              onPointerDown={(event) => { setDragging(true); canvasRef.current?.setPointerCapture(event.pointerId); dragStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y } }}
              onPointerMove={(event) => { if (!dragging) return; setPan({ x: dragStart.current.panX + event.clientX - dragStart.current.x, y: dragStart.current.panY + event.clientY - dragStart.current.y }); setHoverPoint(null) }}
              onPointerUp={(event) => { setDragging(false); canvasRef.current?.releasePointerCapture(event.pointerId) }}
            />

            <div className="absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-3 bg-eggshell/80 px-3 py-2 text-xs text-gravel backdrop-blur">
              <span className="inline-flex items-center gap-2"><span className="size-2 bg-obsidian" />Punt = bericht</span>
              <span className="inline-flex items-center gap-2"><span className="h-4 w-5 border border-ember/35 bg-ember/10" />Raster = clustergebied</span>
              <span>{sortedTopics.length.toLocaleString('nl-BE')} thema’s</span>
            </div>
            {showMiniMap ? (
              <div className="pointer-events-none absolute bottom-4 right-4 z-10 w-48 border border-obsidian/15 bg-eggshell/88 p-2 shadow-[0_18px_55px_rgba(31,29,27,0.16)] backdrop-blur md:w-56" role="img" aria-label="Minikaart met het huidige ingezoomde venster">
                <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gravel">
                  <span>Overzicht</span>
                  <span>{scale.toFixed(1)}×</span>
                </div>
                <canvas ref={minimapRef} className="block h-28 w-full" aria-hidden="true" />
              </div>
            ) : (
              <div className="absolute bottom-4 right-4 z-10 bg-eggshell/80 px-3 py-2 font-mono text-[11px] text-gravel backdrop-blur">{visibleStatus}</div>
            )}

            {hoverPoint && (
              <div ref={tooltipRef} className="fixed z-50 max-w-sm" style={{ left: tooltipPosition.left, top: tooltipPosition.top }}>
                <div className="grid grid-cols-[4.5rem_1fr] gap-3 bg-eggshell/95 p-3 text-sm backdrop-blur">
                  {hoverPoint.image ? <img className="size-18 object-cover" src={thumbImage(hoverPoint.image)} data-fallback-src={archiveAssetUrl(hoverPoint.image)} alt="" loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = event.currentTarget.dataset.fallbackSrc || hoverPoint.image || '' }} /> : <div className="grid size-18 place-items-center bg-powder"><Images className="size-5 text-gravel" /></div>}
                  <div><p className="mb-1 text-xs text-gravel">{formatDate(hoverPoint.date)} · {labelFor(hoverPoint.topicId)}</p><strong className="line-clamp-2 font-medium">{hoverPoint.title}</strong><span className="mt-1 inline-flex items-center gap-1 text-xs text-gravel">Klik voor details <ArrowRight className="size-3.5" aria-hidden="true" /></span></div>
                </div>
              </div>
            )}
          </div>
        </main>

        {hasDetailSelection && (
          <aside className="relative self-start border-l border-chalk pl-5 lg:sticky lg:top-20" aria-label="Atlas detailpaneel">
            <button className="absolute right-0 top-0 bg-transparent px-2 text-xl leading-none text-gravel shadow-none hover:text-obsidian" type="button" onClick={() => clearSelection()} aria-label="Selectie sluiten">×</button>
            {selectedPoint ? (
            <section>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-gravel">Geselecteerd bericht</p>
              {selectedPoint.image ? <img className="mt-4 aspect-[4/3] w-full object-cover" src={thumbImage(selectedPoint.image)} data-fallback-src={archiveAssetUrl(selectedPoint.image)} alt="" loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = event.currentTarget.dataset.fallbackSrc || selectedPoint.image || '' }} /> : <div className="mt-4 grid aspect-[4/3] w-full place-items-center bg-powder"><Images className="size-8 text-gravel" aria-hidden="true" /></div>}
              <p className="mt-4 text-sm text-gravel">{formatDate(selectedPoint.date)} · {labelFor(selectedPoint.topicId)}</p>
              <h2 className="mt-2 font-heading text-3xl font-normal leading-tight"><a className="no-underline" href={`/posts/${selectedPoint.slug}/`}>{selectedPoint.title}</a></h2>
              <p className="mt-3 text-sm leading-6 text-gravel">{selectedPoint.excerpt}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-gravel">
                {[...topicKeywords(topicsById.get(selectedPoint.topicId), 3), selectedPoint.season, selectedPoint.imageCount ? 'met beelden' : 'tekst'].map((tag) => <span className="border-b border-chalk py-1" key={tag}>{tag}</span>)}
              </div>
              <div className="mt-5 grid gap-2">
                <a className="flex min-h-10 items-center justify-between bg-obsidian px-4 text-sm text-eggshell no-underline hover:text-eggshell" href={`/posts/${encodeURIComponent(selectedPoint.slug)}/`}>Open bericht <ExternalLink className="size-4" aria-hidden="true" /></a>
                <button className="flex min-h-10 items-center justify-between bg-transparent px-0 text-left text-sm text-obsidian" type="button" onClick={() => setFiltersWithUrl({ ...filters, topic: selectedPoint.topicId }, 'push', { clearPoint: true, clusterId: selectedPoint.topicId })}>Toon verwante berichten <ArrowRight className="size-4" aria-hidden="true" /></button>
              </div>
            </section>
          ) : selectedCluster ? (
            <section>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-gravel">Cluster</p>
              <div className="mt-4 flex items-center gap-3"><span className="size-3 rounded-full" style={{ backgroundColor: colorFor(selectedCluster.id) }} /><h2 className="m-0 font-heading text-3xl font-normal leading-tight">{topicDisplayLabel(selectedCluster)}</h2></div>
              <p className="mt-3 text-sm leading-6 text-gravel">{categoryFor(selectedCluster)?.description ?? 'Een groep inhoudelijk verwante berichten uit het archief.'}</p>
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-chalk py-4 text-sm">
                <div><dt className="text-gravel">Berichten</dt><dd className="m-0 font-mono">{selectedClusterPoints.length.toLocaleString('nl-BE')}</dd></div>
                <div><dt className="text-gravel">Beelden</dt><dd className="m-0 font-mono">{selectedClusterStats?.imageCount.toLocaleString('nl-BE') ?? '—'}</dd></div>
                <div><dt className="text-gravel">Actief</dt><dd className="m-0 font-mono">{selectedClusterStats ? `${selectedClusterStats.fromYear}–${selectedClusterStats.toYear}` : '—'}</dd></div>
                <div><dt className="text-gravel">Seizoen</dt><dd className="m-0 font-mono">{selectedClusterStats?.topSeason ?? '—'}</dd></div>
              </dl>
              <div className="mt-4"><p className="mb-2 text-sm text-gravel">Veel voorkomende woorden</p><div className="flex flex-wrap gap-2 text-xs text-gravel">{topicKeywords(selectedCluster).map((keyword) => <span className="border-b border-chalk py-1" key={keyword}>{keyword}</span>)}</div></div>
              {selectedClusterStats?.representative?.image && <img className="mt-5 aspect-[16/9] w-full object-cover" src={thumbImage(selectedClusterStats.representative.image)} data-fallback-src={archiveAssetUrl(selectedClusterStats.representative.image)} alt="" loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = event.currentTarget.dataset.fallbackSrc || selectedClusterStats.representative.image || '' }} />}
              <div className="mt-5 grid gap-2">
                <button className="flex min-h-10 items-center justify-between bg-obsidian px-4 text-sm text-eggshell" type="button" onClick={isolateSelectedCluster}>Isoleer cluster <LocateFixed className="size-4" aria-hidden="true" /></button>
                <a className="flex min-h-10 items-center justify-between bg-transparent px-0 text-sm text-obsidian no-underline" href={`/archive/?topic=${encodeURIComponent(selectedCluster.id)}`}>Bekijk berichten <ArrowRight className="size-4" aria-hidden="true" /></a>
              </div>
            </section>
          ) : null}
          </aside>
        )}
      </div>

      <section className="mt-6 border-t border-chalk pt-4" id="atlas-startpunten" aria-labelledby="atlas-startpoints-title">
        <div className="mb-3 flex items-center justify-between gap-3"><div><p className="eyebrow">Startpunten</p><h2 id="atlas-startpoints-title" className="m-0 font-heading text-2xl font-normal">Thema’s op de kaart</h2></div><span className="font-mono text-[11px] text-gravel">klik om te focussen</span></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {startpointTopics.map(({ category, topic, point, Icon }) => (
            <button className="group grid grid-cols-[3.5rem_1fr] gap-3 bg-transparent py-3 text-left" key={topic.id} type="button" onClick={() => selectTopic(topic.id, true)}>
              {point?.image ? <img className="size-14 object-cover" src={thumbImage(point.image)} data-fallback-src={archiveAssetUrl(point.image)} alt="" loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = event.currentTarget.dataset.fallbackSrc || point.image || '' }} /> : <span className="grid size-14 place-items-center bg-powder"><Icon className="size-5 text-gravel" aria-hidden="true" /></span>}
              <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-medium"><span className="size-2 rounded-full shrink-0" style={{ backgroundColor: colorFor(topic.id) }} />{category.label}</span><span className="mt-1 block text-xs leading-5 text-gravel">{topic.postCount.toLocaleString('nl-BE')} berichten · {shortLabel(category.description, 48)}</span></span>
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}
