import { useEffect, useRef, useState, type RefObject } from 'react'
import type { GalleryFilters, GalleryImageRecord } from '../../lib/imageGallerySession'
import {
  fetchGalleryJson,
  galleryFiltersFromUrlState,
  gallerySlideshowRoute,
  imageFullSrc,
  imageGalleryStateFromUrl,
} from '../../lib/imageGallerySession'
import { currentBrowserPath, writeBrowserPath } from '../../lib/browserHistory'
import { isAbortError } from '../../lib/clientFetch'
import { defaultGalleryFilters } from './galleryClientHooks'

export type ImageSize = {
  width: number
  height: number
}

type TimelineVirtualizer = {
  measure: () => void
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto' }) => void
}

export function useLatestRef<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

export function useGalleryViewerUrlState() {
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [slideshowRequestedId, setSlideshowRequestedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<GalleryFilters>(defaultGalleryFilters)
  const slideshowRouteRef = useRef(false)

  useEffect(() => {
    const applyUrlState = () => {
      const state = imageGalleryStateFromUrl(window.location.search)
      const isSlideshowRoute = window.location.pathname === gallerySlideshowRoute
      slideshowRouteRef.current = isSlideshowRoute
      setViewerId(state.viewerId)
      setSlideshowRequestedId(isSlideshowRoute ? state.viewerId : null)
      setFilters(galleryFiltersFromUrlState(state))
    }

    applyUrlState()
    window.addEventListener('popstate', applyUrlState)
    return () => window.removeEventListener('popstate', applyUrlState)
  }, [])

  return { filters, setFilters, slideshowRequestedId, setSlideshowRequestedId, slideshowRouteRef, viewerId, setViewerId }
}

export function useGalleryViewerData(initialImages: GalleryImageRecord[], enabled: boolean) {
  const [images, setImages] = useState<GalleryImageRecord[]>(initialImages)
  const [imagesLoading, setImagesLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return undefined

    const controller = new AbortController()
    setImagesLoading(true)
    fetchGalleryJson<GalleryImageRecord[]>('/generated/image-index.client.json', 'high', controller.signal)
      .catch((error) => {
        if (isAbortError(error)) throw error
        return fetchGalleryJson<GalleryImageRecord[]>('/generated/image-index.json', 'high', controller.signal)
      })
      .then(setImages)
      .catch((error) => {
        if (!isAbortError(error)) console.error(error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setImagesLoading(false)
      })
    return () => controller.abort()
  }, [enabled])

  return { images, imagesLoading }
}

export function useRelatedGalleryImages(enabled: boolean) {
  const [related, setRelated] = useState<Record<string, string[]>>({})
  const [relatedLoading, setRelatedLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return undefined

    const controller = new AbortController()
    setRelatedLoading(true)
    fetchGalleryJson<Record<string, string[]>>('/generated/image-related.json', 'low', controller.signal)
      .then(setRelated)
      .catch((error) => {
        if (!isAbortError(error)) console.error(error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setRelatedLoading(false)
      })
    return () => controller.abort()
  }, [enabled])

  return { related, relatedLoading }
}

export function useFullscreenState(targetRef?: RefObject<Element | null>) {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const updateFullscreenState = () => {
      setFullscreen(targetRef ? document.fullscreenElement === targetRef.current : Boolean(document.fullscreenElement))
    }

    updateFullscreenState()
    document.addEventListener('fullscreenchange', updateFullscreenState)
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState)
  }, [targetRef])

  return fullscreen
}

export function useStoredPreference<T extends string>(storageKey: string, defaultValue: T, isValue: (value: string | null) => value is T) {
  const [value, setValue] = useState<T>(defaultValue)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(storageKey)
      if (isValue(storedValue)) setValue(storedValue)
    } catch {
      // Ignore unavailable storage; the in-memory default still works.
    }
    setReady(true)
  }, [storageKey, isValue])

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(storageKey, value)
    } catch {
      // Ignore unavailable storage; the preference just won't persist.
    }
  }, [ready, storageKey, value])

  return { value, setValue, ready }
}

export function useElementSize<TElement extends HTMLElement>(ref: RefObject<TElement | null>, resetSignal: unknown): ImageSize {
  const [size, setSize] = useState<ImageSize>({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined

    const updateSize = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize)
      return () => window.removeEventListener('resize', updateSize)
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, resetSignal])

  return size
}

export function useViewerKeyboardNavigation({
  enabled,
  onEscape,
  onNext,
  onPrevious,
}: {
  enabled: boolean
  onEscape: () => void
  onNext?: () => void
  onPrevious?: () => void
}) {
  const handlersRef = useLatestRef({ onEscape, onNext, onPrevious })

  useEffect(() => {
    if (!enabled) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      const handlers = handlersRef.current
      if (event.key === 'Escape') handlers.onEscape()
      if (event.key === 'ArrowLeft') handlers.onPrevious?.()
      if (event.key === 'ArrowRight') handlers.onNext?.()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled, handlersRef])
}

export function useCenteredVirtualItem({
  enabled,
  index,
  itemSize,
  scrollerRef,
  virtualizer,
}: {
  enabled: boolean
  index: number
  itemSize: number
  scrollerRef: RefObject<HTMLElement | null>
  virtualizer: TimelineVirtualizer
}) {
  useEffect(() => {
    if (!enabled || index < 0) return undefined

    const frame = window.requestAnimationFrame(() => {
      virtualizer.measure()
      virtualizer.scrollToIndex(index, { align: 'center' })
      const scroller = scrollerRef.current
      if (scroller) scroller.scrollLeft = Math.max(0, index * itemSize - (scroller.clientWidth - itemSize) / 2)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [enabled, index, itemSize, scrollerRef, virtualizer])
}

export function useSlideshowRouteSync<TImage extends GalleryImageRecord>({
  filteredCount,
  filters,
  imageById,
  requestedId,
  routeRef,
  setRequestedId,
  slideshowActive,
  slideshowImageId,
  slideshowMode,
  showImage,
  stop,
  slideshowHrefFor,
}: {
  filteredCount: number
  filters: GalleryFilters
  imageById: Map<string, TImage>
  requestedId: string | null
  routeRef: RefObject<boolean>
  setRequestedId: (imageId: string | null) => void
  slideshowActive: boolean
  slideshowImageId?: string
  slideshowMode: string
  showImage: (imageId: string) => boolean
  stop: () => void
  slideshowHrefFor: (imageId: string) => string
}) {
  const actionsRef = useLatestRef({ setRequestedId, showImage, slideshowHrefFor, stop })

  useEffect(() => {
    if (!requestedId) {
      if (slideshowActive) actionsRef.current.stop()
      return
    }
    if (!imageById.has(requestedId) || filteredCount === 0) return
    routeRef.current = true
    actionsRef.current.showImage(requestedId)
  }, [requestedId, imageById, filteredCount, slideshowMode, slideshowActive, routeRef, actionsRef])

  useEffect(() => {
    if (!slideshowActive || !slideshowImageId || !routeRef.current) return
    if (window.location.pathname !== gallerySlideshowRoute) return
    const nextUrl = actionsRef.current.slideshowHrefFor(slideshowImageId)
    if (nextUrl !== currentBrowserPath()) writeBrowserPath(nextUrl, 'replace')
    if (requestedId !== slideshowImageId) actionsRef.current.setRequestedId(slideshowImageId)
  }, [slideshowActive, slideshowImageId, filters, requestedId, routeRef, actionsRef])
}

export function useImageNeighborPrefetch(viewerImage: GalleryImageRecord | null, previousImage: GalleryImageRecord | null, nextImage: GalleryImageRecord | null) {
  useEffect(() => {
    if (!viewerImage) return undefined
    const links = [previousImage, nextImage]
      .filter((image): image is GalleryImageRecord => Boolean(image))
      .map((image) => {
        const link = document.createElement('link')
        link.rel = 'prefetch'
        link.as = 'image'
        link.href = imageFullSrc(image)
        link.setAttribute('fetchpriority', 'low')
        document.head.appendChild(link)
        return link
      })
    return () => links.forEach((link) => link.remove())
  }, [viewerImage, previousImage, nextImage])
}
