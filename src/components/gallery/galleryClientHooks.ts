import { useEffect, useRef, useState } from 'react'
import { fetchGalleryJson, shouldLoadGallerySpeciesTags, type SpeciesImageTags, type SpeciesTag } from '../../lib/imageGallerySession'

export const LOADER_SHOW_DELAY_MS = 420
export const LOADER_MIN_VISIBLE_MS = 520
export const LOADER_FADE_MS = 220

export function useGracefulLoader(active: boolean) {
  const [shouldRender, setShouldRender] = useState(active)
  const [isVisible, setIsVisible] = useState(false)
  const isVisibleRef = useRef(false)
  const shownAtRef = useRef(0)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    isVisibleRef.current = isVisible
  }, [isVisible])

  useEffect(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current = []

    if (active) {
      setShouldRender(true)
      setIsVisible(false)
      timersRef.current.push(window.setTimeout(() => {
        shownAtRef.current = performance.now()
        isVisibleRef.current = true
        setIsVisible(true)
      }, LOADER_SHOW_DELAY_MS))
      return () => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer))
        timersRef.current = []
      }
    }

    if (!isVisibleRef.current) {
      setIsVisible(false)
      setShouldRender(false)
      return undefined
    }

    const visibleFor = performance.now() - shownAtRef.current
    const waitForMinimum = Math.max(0, LOADER_MIN_VISIBLE_MS - visibleFor)
    timersRef.current.push(window.setTimeout(() => {
      isVisibleRef.current = false
      setIsVisible(false)
      timersRef.current.push(window.setTimeout(() => setShouldRender(false), LOADER_FADE_MS))
    }, waitForMinimum))

    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
      timersRef.current = []
    }
  }, [active])

  return { shouldRender, isVisible }
}

export function useGallerySpeciesTags(filters: { query: string; speciesFilter: string }) {
  const [speciesByImage, setSpeciesByImage] = useState<Record<string, SpeciesTag[]>>({})
  const [speciesTagsLoaded, setSpeciesTagsLoaded] = useState(false)
  const [speciesTagsLoading, setSpeciesTagsLoading] = useState(false)

  useEffect(() => {
    if (!shouldLoadGallerySpeciesTags({ ...filters, speciesTagsLoaded, speciesTagsLoading })) return

    let cancelled = false
    setSpeciesTagsLoading(true)
    fetchGalleryJson<SpeciesImageTags[]>('/generated/species-tags.json', 'low')
      .then((loadedSpeciesTags) => {
        if (cancelled) return
        setSpeciesByImage(Object.fromEntries(loadedSpeciesTags.map((item) => [item.imageId, item.tags])))
        setSpeciesTagsLoaded(true)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setSpeciesTagsLoading(false)
      })

    return () => { cancelled = true }
  }, [filters.query, filters.speciesFilter, speciesTagsLoaded, speciesTagsLoading])

  return { speciesByImage, speciesTagsLoaded, speciesTagsLoading }
}
