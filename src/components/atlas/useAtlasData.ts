import { useEffect, useState } from 'react'
import { fetchJson, type MapPoint, type Topic } from '../../lib/archiveAtlas'
import { generatedDataUrl } from '../../lib/sitePaths'

export function useAtlasData(initialPoints: MapPoint[] = [], initialTopics: Topic[] = []) {
  const [points, setPoints] = useState<MapPoint[]>(initialPoints)
  const [topics, setTopics] = useState<Topic[]>(initialTopics)
  const [loadingData, setLoadingData] = useState(initialPoints.length === 0 || initialTopics.length === 0)
  const [dataError, setDataError] = useState<string | null>(null)

  useEffect(() => {
    if (!loadingData) return undefined

    const controller = new AbortController()
    setDataError(null)
    Promise.all([
      fetchJson<MapPoint[]>(generatedDataUrl('map-points.json'), controller.signal),
      fetchJson<Topic[]>(generatedDataUrl('topics.json'), controller.signal),
    ])
      .then(([loadedPoints, loadedTopics]) => {
        setPoints(loadedPoints)
        setTopics(loadedTopics)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error(error)
        setDataError(error instanceof Error ? error.message : 'Atlasdata kon niet geladen worden')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingData(false)
      })

    return () => controller.abort()
  }, [loadingData])

  return { dataError, loadingData, points, topics }
}
