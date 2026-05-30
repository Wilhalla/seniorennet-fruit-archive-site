import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ExternalLink, Home, Images, LocateFixed, Maximize2, Minus, Plus, RotateCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { archiveAssetUrl } from '../../lib/assetUrls'
import { currentBrowserPath, writeBrowserPath } from '../../lib/browserHistory'
import { ATLAS_X_SPREAD, ATLAS_Y_SPREAD, atlasCategories, atlasCategoryColors, atlasViewportBounds, buildAtlasBrowse, buildAtlasSpatialIndex, categoryFor, clamp, colorMix, formatDate, macroAtlasUnitCoordinate, queryAtlasSpatialIndex, shortLabel, smallThumbImage, themeValue, thumbImage, tinyThumbImage, topicDisplayLabel, topicKeywords, topicSearchText, type AtlasCategory as Category, type AtlasFilters as Filters, type AtlasViewMode as ViewMode, type MapPoint, type RenderCluster, type ScreenPoint, type Topic } from '../../lib/archiveAtlas'
import { macroAtlasCoordinate as macroAtlasCoordinateForBounds, rawAtlasCoordinate, screenFromAtlasPoint } from './atlasDrawingPrimitives'
import { useDismissHydrationLoader } from '../gallery/useGracefulLoader'
import { useAtlasData } from './useAtlasData'
import { useAtlasUrlState } from './useAtlasUrlState'
import { useAtlasViewport } from './useAtlasViewport'

type Props = {
  initialPoints?: MapPoint[]
  initialTopics?: Topic[]
}

type TopicPeak = {
  topicId: string
  x: number
  y: number
  rawX: number
  rawY: number
  count: number
  score: number
}

type HoverInput = {
  clientX: number
  clientY: number
}

export default function SemanticAtlasApp({ initialPoints = [], initialTopics = [] }: Props) {
  const minimapRef = useRef<HTMLCanvasElement | null>(null)
  const mapShellRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const hoverFrameRef = useRef<number | null>(null)
  const hoverIdleTimerRef = useRef<number | null>(null)
  const lastHoverProcessAtRef = useRef(0)
  const pendingHoverRef = useRef<HoverInput | null>(null)
  const suppressNextClickRef = useRef(false)
  const { dataError, loadingData, points, topics } = useAtlasData(initialPoints, initialTopics)
  useDismissHydrationLoader('atlas-hydration-loader', loadingData)
  const { canvasRef, canvasSize, dragStart, pan, setPan, scale, setScale, zoomAtCanvasPoint } = useAtlasViewport()
  const [filters, setFilters] = useState<Filters>({ topic: 'all', year: 'all', season: 'all', imagesOnly: false, search: '' })
  const [viewMode, setViewMode] = useState<ViewMode>('points')
  const [hoverPoint, setHoverPoint] = useState<MapPoint | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null)
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)
  const [hoverClusterId, setHoverClusterId] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 })
  const [dragging, setDragging] = useState(false)
  const [hoveringAtlas, setHoveringAtlas] = useState(false)

  const atlasBrowse = useMemo(() => buildAtlasBrowse({ points, topics, filters, selectedPoint, selectedClusterId }), [points, topics, filters, selectedPoint, selectedClusterId])
  const { topicsById, sortedTopics, years, categoryBounds, visible, visibleIds, relatedPointIds, selectedCluster, selectedClusterPoints, selectedClusterStats } = atlasBrowse
  const semanticBounds = useMemo(() => {
    if (!points.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 }
    const sortedX = points.map((point) => point.x).sort((a, b) => a - b)
    const sortedY = points.map((point) => point.y).sort((a, b) => a - b)
    const quantile = (values: number[], q: number) => values[clamp(Math.floor(values.length * q), 0, values.length - 1)] ?? 0
    return {
      minX: quantile(sortedX, 0.001),
      maxX: quantile(sortedX, 0.999),
      minY: quantile(sortedY, 0.001),
      maxY: quantile(sortedY, 0.999),
    }
  }, [points])

  function colorFor(topicId: string) {
    const category = categoryFor(topicsById.get(topicId))
    return atlasCategoryColors[category?.id ?? 'heritage'] ?? atlasCategoryColors.heritage
  }

  function labelFor(topicId: string) {
    return topicDisplayLabel(topicsById.get(topicId))
  }

  function macroAtlasCoordinate(categoryId: string, rawX: number, rawY: number, rect = canvasSize): ScreenPoint {
    return macroAtlasCoordinateForBounds(categoryId, rawX, rawY, rect, categoryBounds)
  }

  function atlasPoint(point: MapPoint, rect = canvasSize): ScreenPoint {
    if (viewMode === 'clusters') return macroAtlasCoordinate(categoryIdFor(point.topicId), point.x, point.y, rect)
    return semanticAtlasCoordinate(point.x, point.y, rect)
  }

  function screenPoint(point: MapPoint, rect = canvasSize): ScreenPoint {
    return screenFromAtlasPoint(atlasPoint(point, rect), scale, pan)
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

  function zoomAtViewportCenter(factor: number) {
    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    if (!rect) return
    zoomAtCanvasPoint({ x: rect.width / 2, y: rect.height / 2 }, factor)
  }

  function fullscreenMap() {
    const element = mapShellRef.current
    if (!element || typeof document === 'undefined') return
    if (document.fullscreenElement === element) document.exitFullscreen().catch(() => {})
    else element.requestFullscreen().catch(() => {})
  }

  function resetFilters() {
    const nextFilters = { topic: 'all', year: 'all', season: 'all', imagesOnly: false, search: '' }
    resetView()
    setSelectedPoint(null)
    setSelectedClusterId(null)
    setFilters(nextFilters)
    updateAtlasUrl({ nextFilters, point: null, clusterId: null })
  }

  useAtlasUrlState({
    points,
    topicsById,
    setFilters,
    setSelectedClusterId,
    setSelectedPoint,
  })

  function semanticUnitCoordinate(rawX: number, rawY: number): ScreenPoint {
    const spanX = Math.max(0.001, semanticBounds.maxX - semanticBounds.minX)
    const spanY = Math.max(0.001, semanticBounds.maxY - semanticBounds.minY)
    return {
      x: clamp(0.025 + ((rawX - semanticBounds.minX) / spanX) * 0.95, 0.025, 0.975),
      y: clamp(0.045 + ((rawY - semanticBounds.minY) / spanY) * 0.91, 0.045, 0.955),
    }
  }

  function semanticAtlasCoordinate(rawX: number, rawY: number, rect = canvasSize): ScreenPoint {
    const unit = semanticUnitCoordinate(rawX, rawY)
    return { x: unit.x * rect.width, y: unit.y * rect.height }
  }

  function screenAtlasCoordinate(x: number, y: number, rect = canvasSize): ScreenPoint {
    return screenFromAtlasPoint(rawAtlasCoordinate(x, y, rect), scale, pan)
  }

  function topicScreenAtlasCoordinate(topicId: string, x: number, y: number, rect = canvasSize): ScreenPoint {
    const p = viewMode === 'clusters' ? macroAtlasCoordinate(categoryIdFor(topicId), x, y, rect) : semanticAtlasCoordinate(x, y, rect)
    return screenFromAtlasPoint(p, scale, pan)
  }

  function categoryIdFor(topicId: string) {
    return categoryFor(topicsById.get(topicId))?.id ?? 'heritage'
  }

  function atlasUnitPoint(point: MapPoint): ScreenPoint {
    if (viewMode === 'clusters') return macroAtlasUnitCoordinate(categoryIdFor(point.topicId), point.x, point.y, categoryBounds)
    return semanticUnitCoordinate(point.x, point.y)
  }

  const viewportBounds = useMemo(() => atlasViewportBounds(canvasSize, scale, pan, 180), [canvasSize, scale, pan])
  const allPointIndex = useMemo(() => buildAtlasSpatialIndex(points, atlasUnitPoint), [points, viewMode, categoryBounds, topicsById, semanticBounds])
  const visiblePointIndex = useMemo(() => buildAtlasSpatialIndex(visible, atlasUnitPoint), [visible, viewMode, categoryBounds, topicsById, semanticBounds])
  const viewportPoints = useMemo(() => queryAtlasSpatialIndex(allPointIndex, viewportBounds), [allPointIndex, viewportBounds])
  const visibleViewportPoints = useMemo(() => queryAtlasSpatialIndex(visiblePointIndex, viewportBounds), [visiblePointIndex, viewportBounds])
  const isCompactAtlas = canvasSize.width < 720 || (typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false))
  const drawAtlasAtmosphere = false

  function topicDensityPeaks(rect: { width: number; height: number }, topicFilter?: string): TopicPeak[] {
    const gridW = 34
    const gridH = 24
    const cells = new Map<string, { topicId: string; cellX: number; cellY: number; count: number; sumX: number; sumY: number }>()
    for (const point of visibleViewportPoints) {
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
    const minorAlpha = scale > 1.25 ? 0.018 : 0.012
    const majorAlpha = scale > 1.25 ? 0.034 : 0.022
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

  function drawDensityTerrain(context: CanvasRenderingContext2D, rect: { width: number; height: number }) {
    const gridW = 56
    const gridH = 36
    const grids = new Map<string, Float32Array>()
    for (const point of visibleViewportPoints) {
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
          const p = screenFromAtlasPoint(semanticAtlasCoordinate(rawX, rawY, rect), scale, pan)
          if (p.x < -140 || p.y < -140 || p.x > rect.width + 140 || p.y > rect.height + 140) continue
          const strength = value / max
          const radius = clamp((rect.width * ATLAS_X_SPREAD / gridW) * scale * (2.8 + strength * 2.2), 18, 120)
          const alpha = clamp(strength * 0.095, 0.008, 0.11)
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
    const groups = new Map<string, { unitX: number; unitY: number; count: number }>()
    for (const point of visible) {
      const unit = atlasUnitPoint(point)
      const group = groups.get(point.topicId) ?? { unitX: 0, unitY: 0, count: 0 }
      group.unitX += unit.x
      group.unitY += unit.y
      group.count += 1
      groups.set(point.topicId, group)
    }
    return [...groups.entries()]
      .map(([topicId, group]) => {
        const atlas = { x: (group.unitX / group.count) * rect.width, y: (group.unitY / group.count) * rect.height }
        return { ...screenFromAtlasPoint(atlas, scale, pan), count: group.count, topicId }
      })
      .sort((a, b) => b.count - a.count)
  }

  function drawCloudCore(context: CanvasRenderingContext2D, x: number, y: number, radiusX: number, radiusY: number, color: string, alpha: number) {
    context.save()
    context.translate(x, y)
    context.scale(radiusX / Math.max(1, radiusY), 1)
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radiusY)
    gradient.addColorStop(0, colorMix(color, alpha))
    gradient.addColorStop(0.42, colorMix(color, alpha * 0.62))
    gradient.addColorStop(0.78, colorMix(color, alpha * 0.18))
    gradient.addColorStop(1, colorMix(color, 0))
    context.fillStyle = gradient
    context.beginPath()
    context.arc(0, 0, radiusY, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }

  function ellipseRadiusAtAngle(radiusX: number, radiusY: number, angle: number) {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    return 1 / Math.sqrt((cos * cos) / (radiusX * radiusX) + (sin * sin) / (radiusY * radiusY))
  }

  function drawSmoothClosedPath(context: CanvasRenderingContext2D, points: ScreenPoint[]) {
    if (!points.length) return
    context.beginPath()
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i]!
      const next = points[(i + 1) % points.length]!
      const mid = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 }
      if (i === 0) context.moveTo(mid.x, mid.y)
      context.quadraticCurveTo(next.x, next.y, mid.x, mid.y)
    }
    context.closePath()
  }

  function clusterTerritoryPoints(cluster: RenderCluster, clusters: RenderCluster[], radiusX: number, radiusY: number, seed: number): ScreenPoint[] {
    const points: ScreenPoint[] = []
    const sampleCount = 32
    const ownWeight = Math.sqrt(cluster.count)
    const minRadius = Math.min(radiusX, radiusY) * 0.34
    const gap = 10 * Math.sqrt(scale)

    for (let i = 0; i < sampleCount; i += 1) {
      const angle = (i / sampleCount) * Math.PI * 2
      const ux = Math.cos(angle)
      const uy = Math.sin(angle)
      const wobble = 0.92 + 0.07 * Math.sin(seed * 0.013 + i * 1.73) + 0.035 * Math.sin(seed * 0.031 + i * 3.11)
      let boundary = ellipseRadiusAtAngle(radiusX, radiusY, angle) * wobble

      for (const other of clusters) {
        if (other.topicId === cluster.topicId) continue
        const dx = other.x - cluster.x
        const dy = other.y - cluster.y
        const projection = dx * ux + dy * uy
        if (projection <= 0) continue
        const distanceSq = dx * dx + dy * dy
        const weightBias = clamp((ownWeight - Math.sqrt(other.count)) * scale * 1.8, -boundary * 0.28, boundary * 0.28)
        const neighborBoundary = distanceSq / (2 * projection) + weightBias - gap
        if (neighborBoundary > 0) boundary = Math.min(boundary, Math.max(minRadius, neighborBoundary))
      }

      points.push({ x: cluster.x + ux * boundary, y: cluster.y + uy * boundary })
    }
    return points
  }

  function topicSeed(topicId: string) {
    let seed = 0
    for (let i = 0; i < topicId.length; i += 1) seed = (seed * 31 + topicId.charCodeAt(i)) % 9973
    return seed || 1
  }

  function drawPointClusters(context: CanvasRenderingContext2D, rect: { width: number; height: number }, layer: 'regions' | 'labels' | 'all' = 'all') {
    const clusters = visibleRenderClusters(rect)
    const selectedTopic = selectedPoint?.topicId ?? selectedClusterId
    const majorLimit = selectedTopic ? 34 : viewMode === 'clusters' ? 42 : 36
    const renderedClusters = clusters
      .filter((cluster, index) => index < majorLimit || cluster.topicId === selectedTopic || cluster.topicId === hoverClusterId)
      .sort((a, b) => a.count - b.count)
    const maxCount = Math.max(1, ...clusters.map((cluster) => cluster.count))

    if (layer !== 'labels') {
    context.save()
    context.lineJoin = 'round'
    context.lineCap = 'round'
    for (const cluster of renderedClusters) {
      const focused = cluster.topicId === selectedTopic || cluster.topicId === hoverClusterId
      const mutedBySelection = Boolean(selectedTopic && cluster.topicId !== selectedTopic)
      const color = colorFor(cluster.topicId)
      const prominence = clamp(cluster.count / maxCount, 0.12, 1)
      const atlasRadius = clamp(58 + Math.sqrt(cluster.count) * 7.2, 78, 240)
      const radiusX = atlasRadius * scale * (1.08 + 0.16 * Math.sin(topicSeed(cluster.topicId)))
      const radiusY = atlasRadius * scale * (0.72 + 0.18 * Math.cos(topicSeed(cluster.topicId) * 0.7))
      if (cluster.x + radiusX * 1.4 < 0 || cluster.y + radiusY * 1.4 < 0 || cluster.x - radiusX * 1.4 > rect.width || cluster.y - radiusY * 1.4 > rect.height) continue
      const seed = topicSeed(cluster.topicId)
      const territory = clusterTerritoryPoints(cluster, clusters, radiusX, radiusY, seed)
      const outerAlpha = mutedBySelection ? 0.026 : focused ? 0.18 : 0.07 + prominence * 0.075
      const innerAlpha = mutedBySelection ? 0.022 : focused ? 0.22 : 0.09 + prominence * 0.075
      const coreAlpha = mutedBySelection ? 0.026 : focused ? 0.24 : 0.10 + prominence * 0.09
      const outlineAlpha = mutedBySelection ? 0.04 : focused ? 0.28 : 0.10

      if (!drawAtlasAtmosphere) {
        context.fillStyle = colorMix(color, focused ? 0.12 : mutedBySelection ? 0.018 : 0.045 + prominence * 0.035)
        drawSmoothClosedPath(context, territory)
        context.fill()
        if (focused || viewMode === 'clusters') {
          context.strokeStyle = focused ? 'rgba(17, 17, 17, 0.2)' : colorMix(color, outlineAlpha)
          context.lineWidth = focused ? 1.1 : 0.7
          context.stroke()
        }
        continue
      }

      drawCloudCore(context, cluster.x, cluster.y, radiusX * 0.42, radiusY * 0.42, color, coreAlpha)

      context.globalAlpha = 1
      context.filter = 'blur(14px)'
      context.fillStyle = colorMix(color, outerAlpha)
      drawSmoothClosedPath(context, clusterTerritoryPoints(cluster, clusters, radiusX * 1.08, radiusY * 1.08, seed + 17))
      context.fill()

      context.filter = 'blur(8px)'
      context.fillStyle = colorMix(color, innerAlpha)
      drawSmoothClosedPath(context, clusterTerritoryPoints(cluster, clusters, radiusX * 0.82, radiusY * 0.82, seed + 41))
      context.fill()
      context.filter = 'none'

      if (focused || viewMode === 'clusters') {
        context.strokeStyle = focused ? 'rgba(17, 17, 17, 0.18)' : colorMix(color, outlineAlpha)
        context.lineWidth = focused ? 1.15 : 0.75
        drawSmoothClosedPath(context, territory)
        context.stroke()
      }
    }
    context.restore()
    }
    if (layer === 'regions') return

    context.save()
    context.textBaseline = 'middle'
    context.font = '500 12px "DM Sans Variable", sans-serif'
    const placed: Array<{ x: number; y: number; width: number; height: number }> = []
    const labelLimit = selectedTopic ? 20 : scale > 2 ? 28 : 22
    const labelCandidates = [...clusters]
      .sort((a, b) => {
        const aActive = a.topicId === selectedTopic || a.topicId === hoverClusterId ? 1 : 0
        const bActive = b.topicId === selectedTopic || b.topicId === hoverClusterId ? 1 : 0
        return bActive - aActive || b.count - a.count
      })

    for (const cluster of labelCandidates) {
      if (placed.length >= labelLimit) break
      if (cluster.x < -24 || cluster.y < -24 || cluster.x > rect.width + 24 || cluster.y > rect.height + 24) continue
      if (cluster.count < 18 && cluster.topicId !== selectedTopic && cluster.topicId !== hoverClusterId) continue
      const focused = cluster.topicId === selectedTopic || cluster.topicId === hoverClusterId
      const label = `${shortLabel(labelFor(cluster.topicId), focused ? 28 : 22)} · ${cluster.count.toLocaleString('nl-BE')}`
      const width = Math.min(rect.width - 16, context.measureText(label).width + 34)
      const height = focused ? 30 : 26
      let x = clamp(cluster.x - width / 2, 8, rect.width - width - 8)
      let y = clamp(cluster.y - height / 2 - 8, 8, rect.height - height - 8)
      let fits = false
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const overlaps = placed.some((box) => x < box.x + box.width + 8 && x + width + 8 > box.x && y < box.y + box.height + 8 && y + height + 8 > box.y)
        if (!overlaps) { fits = true; break }
        const direction = attempt % 2 === 0 ? 1 : -1
        y = clamp(cluster.y + direction * (24 + Math.ceil(attempt / 2) * 18), 8, rect.height - height - 8)
        x = clamp(cluster.x - width / 2 + direction * Math.floor(attempt / 2) * 24, 8, rect.width - width - 8)
      }
      if (!fits) continue
      placed.push({ x, y, width, height })

      const color = colorFor(cluster.topicId)
      context.fillStyle = focused ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.84)'
      context.strokeStyle = focused ? 'rgba(17, 17, 17, 0.18)' : 'rgba(17, 17, 17, 0.095)'
      context.lineWidth = focused ? 1.1 : 0.8
      context.beginPath()
      context.roundRect(x, y, width, height, 999)
      context.fill()
      context.stroke()
      context.fillStyle = colorMix(color, focused ? 0.92 : 0.72)
      context.beginPath()
      context.arc(x + 13, y + height / 2, 3, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = focused ? themeValue('--color-obsidian') : 'rgba(17, 17, 17, 0.72)'
      context.fillText(label, x + 23, y + height / 2 + 0.5)
    }
    context.restore()
  }

  const hoverClusters = useMemo(() => {
    if (!canvasSize.width || !canvasSize.height) return []
    return visibleRenderClusters(canvasSize)
  }, [visible, scale, pan, canvasSize, viewMode, categoryBounds, topicsById, semanticBounds])

  function drawRelatedLinks(context: CanvasRenderingContext2D, rect: { width: number; height: number }) {
    if (!selectedPoint) return
    const from = screenPoint(selectedPoint, rect)
    context.save()
    context.strokeStyle = 'rgba(31, 29, 27, 0.13)'
    context.lineWidth = 0.8
    for (const point of visibleViewportPoints) {
      if (!relatedPointIds.has(point.id)) continue
      const to = screenPoint(point, rect)
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      context.stroke()
    }
    context.restore()
  }

  function drawMainAtlasCanvas() {
  const canvas = canvasRef.current
  const context = canvas?.getContext('2d')
  if (!canvas || !context || !canvasSize.width || !canvasSize.height) return
  const rect = canvasSize
  context.clearRect(0, 0, rect.width, rect.height)

  drawAtlasGrid(context, rect)
  if (drawAtlasAtmosphere) drawDensityTerrain(context, rect)
  drawPointClusters(context, rect, 'regions')
  if (drawAtlasAtmosphere && (selectedPoint || selectedClusterId)) drawSelectedTopicIslands(context, rect)
  if (!isCompactAtlas) drawRelatedLinks(context, rect)

  const filtersActive = filters.topic !== 'all' || filters.year !== 'all' || filters.season !== 'all' || filters.imagesOnly || Boolean(filters.search.trim())

  context.save()
  if (filtersActive && scale >= 1.1) {
    for (const point of viewportPoints) {
      if (visibleIds.has(point.id)) continue
      const p = screenPoint(point, rect)
      if (p.x < -8 || p.y < -8 || p.x > rect.width + 8 || p.y > rect.height + 8) continue
      const radius = clamp(0.9 + scale * 0.1, 1, 2)
      context.fillStyle = 'rgba(17, 17, 17, 0.055)'
      context.beginPath()
      context.arc(p.x, p.y, radius, 0, Math.PI * 2)
      context.fill()
    }
  }

  for (const point of visibleViewportPoints) {
    const p = screenPoint(point, rect)
    if (p.x < -10 || p.y < -10 || p.x > rect.width + 10 || p.y > rect.height + 10) continue
    const isSelected = point.id === selectedPoint?.id
    const isRelated = relatedPointIds.has(point.id)
    const activeTopic = selectedPoint?.topicId ?? selectedClusterId ?? hoverClusterId
    const isSameCluster = point.topicId === activeTopic
    const hasFocus = Boolean(selectedPoint || selectedClusterId || hoverClusterId)
    const radius = isSelected
      ? 4.3
      : isRelated
        ? 3.2
        : point.imageCount > 0
          ? clamp(1.2 + scale * 0.2, 1.55, 2.85)
          : clamp(1.02 + scale * 0.15, 1.35, 2.4)
    const alpha = !hasFocus ? 0.36 : isSelected || isRelated ? 0.94 : isSameCluster ? 0.62 : 0.095
    context.fillStyle = `rgba(17, 17, 17, ${alpha})`
    context.beginPath()
    context.arc(p.x, p.y, radius, 0, Math.PI * 2)
    context.fill()
    if (!isCompactAtlas && point.imageCount > 0 && scale > 1.45 && !isSelected) {
      context.strokeStyle = `rgba(17, 17, 17, ${Math.min(0.32, alpha + 0.08)})`
      context.lineWidth = 0.65
      context.beginPath()
      context.arc(p.x, p.y, radius + 1.15, 0, Math.PI * 2)
      context.stroke()
    }
  }

  for (const point of [selectedPoint]) {
    if (!point) continue
    const p = screenPoint(point, rect)
    const selected = point === selectedPoint
    const radius = selected ? 4.8 : 3.8
    context.globalAlpha = 1
    context.fillStyle = 'rgba(17, 17, 17, 0.9)'
    context.beginPath()
    context.arc(p.x, p.y, radius, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = selected ? 'rgba(17, 17, 17, 0.28)' : 'rgba(17, 17, 17, 0.18)'
    context.lineWidth = selected ? 8 : 5
    context.beginPath()
    context.arc(p.x, p.y, selected ? 12 : 9, 0, Math.PI * 2)
    context.stroke()
    context.strokeStyle = selected ? 'rgba(17, 17, 17, 0.82)' : 'rgba(17, 17, 17, 0.46)'
    context.lineWidth = selected ? 1.2 : 0.9
    context.beginPath()
    context.arc(p.x, p.y, selected ? 15 : 11, 0, Math.PI * 2)
    context.stroke()
  }
  context.restore()
  if (!dragging) drawPointClusters(context, rect, 'labels')
  }

  useEffect(() => {
    drawMainAtlasCanvas()
  }, [filters, visible, viewportPoints, visibleViewportPoints, visibleIds, relatedPointIds, topicsById, hoverClusterId, selectedPoint, selectedClusterId, viewMode, scale, pan, canvasSize, hoveringAtlas])

  const showMiniMap = scale > 1.08 && !isCompactAtlas && !dragging

  useEffect(() => {
    const canvas = minimapRef.current
    if (!canvas || !showMiniMap || !canvasSize.width || !canvasSize.height) return

    const bounds = canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return

    const dpr = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1))
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

  useEffect(() => {
    return () => {
      if (hoverFrameRef.current !== null) window.cancelAnimationFrame(hoverFrameRef.current)
      if (hoverIdleTimerRef.current !== null) window.clearTimeout(hoverIdleTimerRef.current)
    }
  }, [])

  function canvasLocalPoint(input: HoverInput) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return { x: input.clientX - rect.left, y: input.clientY - rect.top, rect: { width: rect.width, height: rect.height } }
  }

  function nearestPoint(input: HoverInput) {
    const local = canvasLocalPoint(input)
    if (!local || scale < 1.65) return null
    let best: MapPoint | null = null
    const hitRadius = clamp(16 + scale * 1.2, 18, 34)
    let bestDistance = hitRadius * hitRadius
    for (const point of visibleViewportPoints) {
      const p = screenPoint(point, local.rect)
      const distance = (p.x - local.x) ** 2 + (p.y - local.y) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        best = point
      }
    }
    return best
  }

  function nearestCluster(input: HoverInput) {
    const local = canvasLocalPoint(input)
    if (!local) return null
    return hoverClusters.find((cluster) => {
      const radius = clamp(56 + Math.sqrt(cluster.count) * 5.5, 72, 170)
      return (cluster.x - local.x) ** 2 + (cluster.y - local.y) ** 2 < radius ** 2
    }) ?? null
  }

  function processHover(input: HoverInput) {
    if (dragging || isCompactAtlas) return
    const point = nearestPoint(input)
    setHoverPoint((current) => current?.id === point?.id ? current : point)
    setHoverClusterId((current) => current === null ? current : null)
    if (!point) return
    const tooltip = tooltipRef.current
    const offset = 14
    const width = tooltip?.offsetWidth ?? 360
    const height = tooltip?.offsetHeight ?? 130
    const nextPosition = {
      left: Math.min(input.clientX + offset, Math.max(offset, window.innerWidth - width - offset)),
      top: Math.min(input.clientY + offset, Math.max(offset, window.innerHeight - height - offset)),
    }
    if (tooltip && hoverPoint?.id === point.id) {
      tooltip.style.left = `${nextPosition.left}px`
      tooltip.style.top = `${nextPosition.top}px`
      return
    }
    setTooltipPosition((current) => Math.abs(current.left - nextPosition.left) < 2 && Math.abs(current.top - nextPosition.top) < 2 ? current : nextPosition)
  }

  function updateHover(event: React.MouseEvent<HTMLCanvasElement>) {
    if (dragging || isCompactAtlas) return
    if (!hoveringAtlas) setHoveringAtlas(true)
    if (hoverIdleTimerRef.current !== null) window.clearTimeout(hoverIdleTimerRef.current)
    hoverIdleTimerRef.current = window.setTimeout(() => {
      hoverIdleTimerRef.current = null
      setHoveringAtlas(false)
    }, 180)
    pendingHoverRef.current = { clientX: event.clientX, clientY: event.clientY }
    const now = performance.now()
    if (now - lastHoverProcessAtRef.current < 48) return
    lastHoverProcessAtRef.current = now
    if (hoverFrameRef.current !== null) return
    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = null
      const input = pendingHoverRef.current
      pendingHoverRef.current = null
      if (input) processHover(input)
    })
  }

  function clearHover() {
    pendingHoverRef.current = null
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current)
      hoverFrameRef.current = null
    }
    if (hoverIdleTimerRef.current !== null) {
      window.clearTimeout(hoverIdleTimerRef.current)
      hoverIdleTimerRef.current = null
    }
    setHoveringAtlas(false)
    setHoverPoint((current) => current === null ? current : null)
    setHoverClusterId((current) => current === null ? current : null)
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
    <section className="relative z-10 mx-auto w-full max-w-[120rem] bg-[#fbfbfa] px-5 py-4 text-obsidian max-md:px-4" data-atlas-root>
      {dataError && (
        <div className="mb-4 border-y border-chalk bg-powder px-4 py-3 text-sm text-obsidian" role="alert">
          <strong className="font-medium">Atlasdata niet geladen.</strong> Controleer of de gegenereerde JSON-bestanden beschikbaar zijn. <span className="font-mono text-xs">{dataError}</span>
        </div>
      )}

      <header className="grid gap-4 border-b border-chalk pb-3 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-end">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="display-title">Atlas</h1>
            <details className="group relative z-30">
              <summary className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full border border-chalk bg-eggshell text-xs text-gravel transition-colors hover:border-obsidian hover:text-obsidian [&::-webkit-details-marker]:hidden" aria-label="Hoe lees je de atlas?">?</summary>
              <div className="absolute left-0 top-10 w-72 border border-chalk bg-eggshell p-4 text-sm leading-6 text-gravel shadow-[0_24px_70px_rgba(31,29,27,0.14)]">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-obsidian">Hoe lezen</p>
                <ol className="m-0 grid list-none gap-2 p-0">
                  <li><strong className="text-obsidian">Punten.</strong> Elke stip is een archiefbericht.</li>
                  <li><strong className="text-obsidian">Nabijheid.</strong> Dichterbij betekent vaker verwant.</li>
                  <li><strong className="text-obsidian">Eilanden.</strong> Zachte velden tonen dichte thema’s.</li>
                </ol>
              </div>
            </details>
          </div>
          <p className="mt-2 font-mono text-sm text-gravel">{points.length.toLocaleString('nl-BE')} berichten · {sortedTopics.length.toLocaleString('nl-BE')} thema’s</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(17rem,26rem)_minmax(0,1fr)] lg:items-end">
          <label className="relative block">
            <span className="sr-only">Zoek in de atlas</span>
            <Input className="h-11 w-full rounded-none border-0 border-b border-chalk bg-transparent px-0 pr-9 font-mono text-sm shadow-none placeholder:text-gravel focus-visible:ring-0" value={filters.search} onChange={(event) => setFiltersWithUrl({ ...filters, search: event.target.value }, 'replace')} type="search" placeholder="[ Zoek archief… ]" />
            <Search className="absolute right-0 top-1/2 size-4 -translate-y-1/2 text-gravel" aria-hidden="true" />
          </label>
          <nav className="flex flex-wrap items-center gap-2 lg:justify-end" aria-label="Thema startpunten">
            {startpointTopics.map(({ category, topic }) => (
              <button className="inline-flex min-h-8 items-center gap-2 rounded-full border border-obsidian/10 bg-white/60 px-3 text-xs text-gravel backdrop-blur transition-colors hover:border-obsidian/20 hover:bg-white hover:text-obsidian" key={topic.id} type="button" onClick={() => selectTopic(topic.id, true)}>
                <span className="size-1.5 rounded-full" style={{ backgroundColor: colorFor(topic.id) }} />
                <span>{category.label}</span>
                <span className="font-mono text-[10px] text-gravel/80">{topic.postCount.toLocaleString('nl-BE')}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className={`grid gap-4 pt-4 ${hasDetailSelection ? 'xl:grid-cols-[10.5rem_minmax(0,1fr)_20rem]' : 'xl:grid-cols-[10.5rem_minmax(0,1fr)]'}`}>
        <aside className="self-start border-b border-chalk pb-4 text-sm xl:sticky xl:top-20 xl:border-b-0 xl:pb-0" aria-label="Atlas filters">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <section>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-gravel">Filters</p>
              <div className="grid gap-3">
                <label className="grid gap-1 text-xs text-gravel">Thema<Select value={filters.topic} onValueChange={(value) => setFiltersWithUrl({ ...filters, topic: value }, 'push', { clearPoint: true, clusterId: value === 'all' ? null : value })}><SelectTrigger className="h-8 rounded-none border-0 border-b border-chalk bg-transparent px-0 text-left text-sm shadow-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle thema’s</SelectItem>{sortedTopics.map((topic) => <SelectItem key={topic.id} value={topic.id}>{topicDisplayLabel(topic)} ({topic.postCount})</SelectItem>)}</SelectContent></Select></label>
                <label className="grid gap-1 text-xs text-gravel">Jaar<Select value={filters.year} onValueChange={(value) => setFiltersWithUrl({ ...filters, year: value })}><SelectTrigger className="h-8 rounded-none border-0 border-b border-chalk bg-transparent px-0 text-left text-sm shadow-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle jaren</SelectItem>{years.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent></Select></label>
                <label className="grid gap-1 text-xs text-gravel">Seizoen<Select value={filters.season} onValueChange={(value) => setFiltersWithUrl({ ...filters, season: value })}><SelectTrigger className="h-8 rounded-none border-0 border-b border-chalk bg-transparent px-0 text-left text-sm shadow-none"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle seizoenen</SelectItem><SelectItem value="lente">lente</SelectItem><SelectItem value="zomer">zomer</SelectItem><SelectItem value="herfst">herfst</SelectItem><SelectItem value="winter">winter</SelectItem></SelectContent></Select></label>
                <button className={`flex min-h-8 items-center justify-between border-b border-chalk px-0 text-left text-sm transition-colors ${filters.imagesOnly ? 'text-obsidian' : 'text-gravel hover:text-obsidian'}`} type="button" onClick={() => setFiltersWithUrl({ ...filters, imagesOnly: !filters.imagesOnly })}><span>Beelden</span><span className="font-mono text-xs">{filters.imagesOnly ? 'aan' : 'alle'}</span></button>
                <Button className="h-8 justify-start rounded-none bg-transparent px-0 text-xs text-gravel shadow-none hover:!bg-transparent hover:text-obsidian" variant="ghost" type="button" onClick={resetFilters}>Reset <RotateCw className="size-3.5" aria-hidden="true" /></Button>
              </div>
            </section>

            <section>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-gravel">Weergave</p>
              <div className="grid gap-1 font-mono text-sm text-gravel" aria-label="Weergave">
                {(['points', 'clusters'] as ViewMode[]).map((mode) => (
                  <button key={mode} className={`flex items-center gap-2 py-1 text-left ${viewMode === mode ? 'text-obsidian' : 'hover:text-obsidian'}`} type="button" onClick={() => setViewMode(mode)}>
                    <span aria-hidden="true">{viewMode === mode ? '•' : '○'}</span>{mode === 'points' ? 'Punten' : 'Thema’s'}
                  </button>
                ))}
              </div>
              <p className="mt-4 font-mono text-[11px] leading-5 text-gravel">{visibleStatus}</p>
            </section>
          </div>
        </aside>

        <main className="min-w-0">
          <div ref={mapShellRef} className="relative h-[76vh] min-h-[38rem] max-h-[58rem] overflow-hidden border border-chalk bg-[#fbfbfa] shadow-[0_22px_80px_rgba(31,29,27,0.06)] max-md:h-[68vh] max-md:min-h-[28rem] fullscreen:h-screen fullscreen:max-h-none fullscreen:min-h-0 fullscreen:w-screen fullscreen:border-0">
            <div className="absolute left-4 top-4 z-10 flex items-center gap-1" aria-label="Kaartbediening">
              <Button className="size-9 rounded-full bg-eggshell/85 p-0 shadow-none backdrop-blur hover:bg-powder" variant="ghost" size="icon" type="button" onClick={resetView} aria-label="Pas kaart in"><Home className="size-4" /></Button>
              <Button className="size-9 rounded-full bg-eggshell/85 p-0 shadow-none backdrop-blur hover:bg-powder" variant="ghost" size="icon" type="button" onClick={() => zoomAtViewportCenter(1.28)} aria-label="Inzoomen"><Plus className="size-4" /></Button>
              <Button className="size-9 rounded-full bg-eggshell/85 p-0 shadow-none backdrop-blur hover:bg-powder" variant="ghost" size="icon" type="button" onClick={() => zoomAtViewportCenter(1 / 1.28)} aria-label="Uitzoomen"><Minus className="size-4" /></Button>
              <Button className="size-9 rounded-full bg-eggshell/85 p-0 shadow-none backdrop-blur hover:bg-powder" variant="ghost" size="icon" type="button" onClick={fullscreenMap} aria-label="Volledig scherm"><Maximize2 className="size-4" /></Button>
            </div>

            <canvas
              className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
              ref={canvasRef}
              aria-label="Kaart van het archief"
              onMouseMove={updateHover}
              onMouseLeave={clearHover}
              onClick={(event) => {
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false
                  return
                }
                const point = nearestPoint(event)
                if (point) { selectPoint(point); return }
                const cluster = nearestCluster(event)
                if (cluster) selectTopic(cluster.topicId)
              }}
              onPointerDown={(event) => { setDragging(true); suppressNextClickRef.current = false; canvasRef.current?.setPointerCapture(event.pointerId); dragStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y } }}
              onPointerMove={(event) => {
                if (!dragging) return
                const dx = event.clientX - dragStart.current.x
                const dy = event.clientY - dragStart.current.y
                if (dx * dx + dy * dy > 36) suppressNextClickRef.current = true
                setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy })
                setHoverPoint(null)
              }}
              onPointerUp={(event) => { setDragging(false); canvasRef.current?.releasePointerCapture(event.pointerId) }}
              onPointerCancel={(event) => { setDragging(false); suppressNextClickRef.current = false; canvasRef.current?.releasePointerCapture(event.pointerId) }}
            />

            <div className="absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-3 bg-eggshell/80 px-3 py-2 text-xs text-gravel backdrop-blur">
              <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-obsidian" />Stip = bericht</span>
              <span className="inline-flex items-center gap-2"><span className="h-3 w-5 rounded-full border border-obsidian/10 bg-obsidian/5" />Eiland = dicht thema</span>
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
                  {!hoveringAtlas && hoverPoint.image ? <img className="size-18 object-cover" src={tinyThumbImage(hoverPoint.image)} data-fallback-src={smallThumbImage(hoverPoint.image)} alt="" loading="lazy" decoding="async" fetchPriority="low" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = event.currentTarget.dataset.fallbackSrc || hoverPoint.image || '' }} /> : <div className="grid size-18 place-items-center bg-powder"><Images className="size-5 text-gravel" /></div>}
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
    </section>
  )
}
