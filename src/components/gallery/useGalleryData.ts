import { useEffect, useState } from 'react'
import { emptyGalleryGroups, fetchGalleryJson, type GalleryGroups, type GalleryImageRecord } from '../../lib/imageGallerySession'
import { isAbortError, type FetchPriority } from '../../lib/clientFetch'
import { loadGalleryIndexChunks } from '../../lib/galleryIndexLoader'

async function fetchGalleryImageIndex(priority?: FetchPriority, signal?: AbortSignal) {
  try {
    return await fetchGalleryJson<GalleryImageRecord[]>('/generated/image-index.client.json', priority, signal)
  } catch (error) {
    if (isAbortError(error)) throw error
    return fetchGalleryJson<GalleryImageRecord[]>('/generated/image-index.json', priority, signal)
  }
}

export function useGalleryData(initialImages?: GalleryImageRecord[], initialGroups?: GalleryGroups, shouldLoadFullIndex = false) {
  const [images, setImages] = useState<GalleryImageRecord[]>(initialImages ?? [])
  const [groups, setGroups] = useState<GalleryGroups>(initialGroups ?? emptyGalleryGroups)
  const [initialDataLoading, setInitialDataLoading] = useState(!initialImages || !initialGroups)
  const [fullIndexLoaded, setFullIndexLoaded] = useState(!initialImages)
  const [fullIndexRequested, setFullIndexRequested] = useState(false)
  const [fullIndexLoading, setFullIndexLoading] = useState(false)

  useEffect(() => {
    if (!initialDataLoading) return undefined

    const controller = new AbortController()
    Promise.all([
      fetchGalleryImageIndex(undefined, controller.signal),
      fetchGalleryJson<GalleryGroups>('/generated/gallery-groups.json', undefined, controller.signal),
    ])
      .then(([loadedImages, loadedGroups]) => {
        setImages(loadedImages)
        setFullIndexLoaded(true)
        setGroups(loadedGroups)
      })
      .catch((error) => {
        if (!isAbortError(error)) console.error(error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setInitialDataLoading(false)
      })

    return () => controller.abort()
  }, [initialDataLoading])

  useEffect(() => {
    if (!shouldLoadFullIndex || fullIndexLoaded || fullIndexRequested || initialDataLoading) return undefined

    let timeoutHandle: number | undefined
    let idleHandle: ReturnType<typeof window.requestIdleCallback> | undefined

    const requestFullIndex = () => setFullIndexRequested(true)
    const scheduleAfterFirstPaint = () => {
      if (window.location.search) {
        timeoutHandle = window.setTimeout(requestFullIndex, 0)
        return
      }
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(requestFullIndex, { timeout: 1200 })
        return
      }
      timeoutHandle = window.setTimeout(requestFullIndex, 250)
    }

    const frameHandle = window.requestAnimationFrame(scheduleAfterFirstPaint)
    return () => {
      window.cancelAnimationFrame(frameHandle)
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle)
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle)
    }
  }, [fullIndexLoaded, fullIndexRequested, initialDataLoading, shouldLoadFullIndex])

  useEffect(() => {
    if (!initialImages || initialDataLoading || fullIndexLoaded || fullIndexRequested) return undefined

    const requestOnIntent = () => setFullIndexRequested(true)
    const requestOnScroll = () => {
      if (window.scrollY > 240) requestOnIntent()
    }
    const requestOnKey = (event: KeyboardEvent) => {
      if (['PageDown', 'End', 'ArrowDown', ' '].includes(event.key)) requestOnIntent()
    }

    window.addEventListener('scroll', requestOnScroll, { passive: true })
    window.addEventListener('wheel', requestOnIntent, { passive: true, once: true })
    window.addEventListener('touchmove', requestOnIntent, { passive: true, once: true })
    window.addEventListener('keydown', requestOnKey)

    return () => {
      window.removeEventListener('scroll', requestOnScroll)
      window.removeEventListener('wheel', requestOnIntent)
      window.removeEventListener('touchmove', requestOnIntent)
      window.removeEventListener('keydown', requestOnKey)
    }
  }, [fullIndexLoaded, fullIndexRequested, initialDataLoading, initialImages])

  useEffect(() => {
    if (!initialImages || initialDataLoading || fullIndexLoaded || !fullIndexRequested) return undefined

    const controller = new AbortController()
    let cancelled = false
    const seedImages = initialImages
    setFullIndexLoading(true)

    async function loadChunkedIndex() {
      try {
        const complete = await loadGalleryIndexChunks({
          initialImages: seedImages,
          onBatch: setImages,
          priority: 'low',
          signal: controller.signal,
        })
        if (!cancelled && !controller.signal.aborted) setFullIndexLoaded(complete)
      } catch (error) {
        if (isAbortError(error)) return
        console.error(error)
        try {
          const loadedImages = await fetchGalleryImageIndex('low', controller.signal)
          if (!cancelled && !controller.signal.aborted) {
            setImages(loadedImages)
            setFullIndexLoaded(true)
          }
        } catch (fallbackError) {
          if (!isAbortError(fallbackError)) console.error(fallbackError)
        }
      } finally {
        if (!controller.signal.aborted && !cancelled) setFullIndexLoading(false)
      }
    }

    loadChunkedIndex()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fullIndexLoaded, fullIndexRequested, initialDataLoading, initialImages])

  return {
    images,
    groups,
    initialDataLoading,
    fullIndexLoaded,
    fullIndexLoading,
    requestFullIndex: () => setFullIndexRequested(true),
  }
}
