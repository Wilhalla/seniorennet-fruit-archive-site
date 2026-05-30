import { useEffect, useRef } from 'react'
import type { AtlasFilters, MapPoint, Topic } from '../../lib/archiveAtlas'

export function useAtlasUrlState({
  points,
  topicsById,
  setFilters,
  setSelectedClusterId,
  setSelectedPoint,
}: {
  points: MapPoint[]
  topicsById: Map<string, Topic>
  setFilters: (filters: AtlasFilters) => void
  setSelectedClusterId: (clusterId: string | null) => void
  setSelectedPoint: (point: MapPoint | null) => void
}) {
  const urlSelectionInitialized = useRef(false)

  useEffect(() => {
    if (!points.length || typeof window === 'undefined') return

    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search)
      const topicParam = params.get('topic')
      const yearParam = params.get('year')
      const seasonParam = params.get('season')
      const nextFilters: AtlasFilters = {
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
  }, [points, topicsById, setFilters, setSelectedClusterId, setSelectedPoint])
}
