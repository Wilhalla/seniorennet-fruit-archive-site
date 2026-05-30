import { useEffect, useState } from 'react'
import { emptyGalleryGroups, fetchGalleryJson, type GalleryGroups, type GalleryImageRecord } from '../../lib/imageGallerySession'
import { isAbortError, type FetchPriority } from '../../lib/clientFetch'

async function fetchGalleryImageIndex(priority?: FetchPriority, signal?: AbortSignal) {
  try {
    return await fetchGalleryJson<GalleryImageRecord[]>('/generated/image-index.client.json', priority, signal)
  } catch (error) {
    if (isAbortError(error)) throw error
    return fetchGalleryJson<GalleryImageRecord[]>('/generated/image-index.json', priority, signal)
  }
}

export function useGalleryData(initialImages?: GalleryImageRecord[], initialGroups?: GalleryGroups) {
  const [images, setImages] = useState<GalleryImageRecord[]>(initialImages ?? [])
  const [groups, setGroups] = useState<GalleryGroups>(initialGroups ?? emptyGalleryGroups)
  const [initialDataLoading, setInitialDataLoading] = useState(!initialImages || !initialGroups)
  const [fullIndexLoaded, setFullIndexLoaded] = useState(!initialImages)

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
    if (!initialImages || initialDataLoading) return undefined

    const controller = new AbortController()
    let timeoutHandle: unknown
    let idleHandle: ReturnType<typeof window.requestIdleCallback> | undefined

    const loadFullIndex = () => {
      fetchGalleryImageIndex('low', controller.signal)
        .then((loadedImages) => {
          setImages(loadedImages)
          setFullIndexLoaded(true)
        })
        .catch((error) => {
          if (!isAbortError(error)) console.error(error)
        })
    }

    const scheduleAfterFirstPaint = () => {
      if (window.location.search) {
        timeoutHandle = window.setTimeout(loadFullIndex, 0)
        return
      }
      const requestIdle = window.requestIdleCallback
      if (typeof requestIdle === 'function') {
        idleHandle = requestIdle(loadFullIndex, { timeout: 1200 })
        return
      }
      timeoutHandle = window.setTimeout(loadFullIndex, 250)
    }

    const frameHandle = window.requestAnimationFrame(scheduleAfterFirstPaint)
    return () => {
      controller.abort()
      window.cancelAnimationFrame(frameHandle)
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle as number)
      const cancelIdle = window.cancelIdleCallback
      if (idleHandle !== undefined && typeof cancelIdle === 'function') cancelIdle(idleHandle)
    }
  }, [initialImages, initialDataLoading])

  return { images, groups, initialDataLoading, fullIndexLoaded }
}
