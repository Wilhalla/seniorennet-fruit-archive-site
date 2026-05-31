import { useEffect, useState } from 'react'
import { emptyGalleryGroups, fetchGalleryJson, type GalleryGroups, type GalleryImageRecord } from '../../lib/imageGallerySession'
import { isAbortError, type FetchPriority } from '../../lib/clientFetch'

type ImageIndexChunk = {
  id: string
  year: string
  file: string
  imageCount: number
}

type ImageIndexChunkManifest = {
  imageCount: number
  chunks: ImageIndexChunk[]
}

async function fetchGalleryImageIndex(priority?: FetchPriority, signal?: AbortSignal) {
  try {
    return await fetchGalleryJson<GalleryImageRecord[]>('/generated/image-index.client.json', priority, signal)
  } catch (error) {
    if (isAbortError(error)) throw error
    return fetchGalleryJson<GalleryImageRecord[]>('/generated/image-index.json', priority, signal)
  }
}

function mergeImages(current: GalleryImageRecord[], next: GalleryImageRecord[]) {
  const seen = new Set<string>()
  const merged: GalleryImageRecord[] = []
  for (const image of [...current, ...next]) {
    if (seen.has(image.id)) continue
    seen.add(image.id)
    merged.push(image)
  }
  return merged
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
    setFullIndexLoading(true)

    async function loadChunkedIndex() {
      try {
        const manifest = await fetchGalleryJson<ImageIndexChunkManifest>('/generated/image-index-chunks.json', 'low', controller.signal)
        if (!manifest.chunks?.length) throw new Error('Geen beeldarchief-chunks gevonden')
        let loadedCount = 0
        for (const chunk of manifest.chunks) {
          if (controller.signal.aborted || cancelled) return
          const chunkImages = await fetchGalleryJson<GalleryImageRecord[]>(`/generated/${chunk.file}`, 'low', controller.signal)
          loadedCount += chunkImages.length
          setImages((current) => mergeImages(current, chunkImages))
          await new Promise((resolve) => window.setTimeout(resolve, 0))
        }
        if (!cancelled && !controller.signal.aborted) setFullIndexLoaded(loadedCount >= manifest.imageCount)
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
