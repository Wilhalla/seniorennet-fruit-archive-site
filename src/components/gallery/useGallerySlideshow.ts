import { useEffect, useRef, useState } from 'react'

export type SlideshowMode = 'chronological' | 'random'

export type GallerySlideshowImage = {
  id: string
  date: string
  isoDate?: string
  year: number | null
  month: number | null
  postTitle: string
  postSlug?: string
  caption: string
}

export const SLIDESHOW_SECONDS_MIN = 2
export const SLIDESHOW_SECONDS_MAX = 60

export function clampSlideshowSeconds(value: number) {
  if (!Number.isFinite(value)) return 5
  return Math.min(SLIDESHOW_SECONDS_MAX, Math.max(SLIDESHOW_SECONDS_MIN, Math.round(value)))
}

function imageChronologyTime(image: GallerySlideshowImage) {
  const parsed = Date.parse(image.isoDate || image.date)
  if (Number.isFinite(parsed)) return parsed
  if (image.year) return Date.UTC(image.year, Math.max(0, (image.month ?? 1) - 1), 1)
  return Number.POSITIVE_INFINITY
}

function rotateToImage<T extends GallerySlideshowImage>(images: T[], imageId: string) {
  const index = images.findIndex((image) => image.id === imageId)
  if (index <= 0) return images
  return [...images.slice(index), ...images.slice(0, index)]
}

function shuffledAroundImage<T extends GallerySlideshowImage>(images: T[], imageId: string) {
  const focused = images.find((image) => image.id === imageId) ?? null
  const pool = images.filter((image) => image.id !== imageId)
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]]
  }
  return focused ? [focused, ...pool] : pool
}

function buildSlideshowSequence<T extends GallerySlideshowImage>(images: T[], mode: SlideshowMode, startImageId: string) {
  if (mode === 'random') return shuffledAroundImage(images, startImageId)

  const chronological = [...images].sort((a, b) => {
    const dateDelta = imageChronologyTime(a) - imageChronologyTime(b)
    if (dateDelta !== 0) return dateDelta
    return a.id.localeCompare(b.id)
  })
  return rotateToImage(chronological, startImageId)
}

type GallerySlideshowOptions = {
  onEscape?: () => void
}

export function useGallerySlideshow<T extends GallerySlideshowImage>(images: T[], imageById: Map<string, T>, activeImage: T | null, options: GallerySlideshowOptions = {}) {
  const [mode, setModeState] = useState<SlideshowMode>('chronological')
  const [seconds, setSecondsState] = useState(5)
  const [paused, setPaused] = useState(false)
  const onEscapeRef = useRef(options.onEscape)
  onEscapeRef.current = options.onEscape
  const [imageIds, setImageIds] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const active = imageIds.length > 0
  const image = active ? imageById.get(imageIds[index] ?? '') ?? null : null
  const preloadImages = active ? [1, 2, 3, -1]
    .map((offset) => imageById.get(imageIds[(index + offset + imageIds.length) % imageIds.length] ?? ''))
    .filter((item): item is T => Boolean(item && item.id !== image?.id)) : []

  function setSeconds(value: number) {
    setSecondsState(clampSlideshowSeconds(value))
  }

  function requestFullscreen() {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {})
    }
  }

  function start(startImageId = activeImage?.id) {
    if (!startImageId || images.length === 0) return false
    const sequence = buildSlideshowSequence(images, mode, startImageId)
    if (sequence.length === 0) return false
    setImageIds(sequence.map((item) => item.id))
    setIndex(0)
    setPaused(false)
    requestFullscreen()
    return true
  }

  function showImage(imageId: string, options: { requestFullscreen?: boolean } = {}) {
    if (!imageById.has(imageId) || images.length === 0) return false
    const currentIndex = imageIds.findIndex((id) => id === imageId)
    if (currentIndex >= 0) {
      setIndex(currentIndex)
      if (options.requestFullscreen) requestFullscreen()
      return true
    }
    const sequence = buildSlideshowSequence(images, mode, imageId)
    if (sequence.length === 0) return false
    setImageIds(sequence.map((item) => item.id))
    setIndex(0)
    if (options.requestFullscreen) requestFullscreen()
    return true
  }

  function stop() {
    setImageIds([])
    setIndex(0)
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {})
    }
  }

  function next() {
    setIndex((current) => imageIds.length ? (current + 1) % imageIds.length : 0)
  }

  function previous() {
    setIndex((current) => imageIds.length ? (current - 1 + imageIds.length) % imageIds.length : 0)
  }

  function togglePaused() {
    setPaused((current) => !current)
  }

  function setMode(nextMode: SlideshowMode) {
    setModeState(nextMode)
    const startImageId = image?.id ?? activeImage?.id
    if (!startImageId || imageIds.length === 0) return
    const sequence = buildSlideshowSequence(images, nextMode, startImageId)
    setImageIds(sequence.map((item) => item.id))
    setIndex(0)
  }

  useEffect(() => {
    if (!active || paused || imageIds.length < 2) return undefined
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % imageIds.length)
    }, clampSlideshowSeconds(seconds) * 1000)
    return () => window.clearTimeout(timer)
  }, [active, paused, imageIds.length, index, seconds])

  useEffect(() => {
    if (!active) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        const onEscape = onEscapeRef.current
        if (onEscape) {
          onEscape()
          return
        }
        stop()
        return
      }

      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
      if (imageIds.length < 2) return

      event.preventDefault()
      event.stopPropagation()
      setIndex((current) => event.key === 'ArrowRight'
        ? (current + 1) % imageIds.length
        : (current - 1 + imageIds.length) % imageIds.length)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active, imageIds.length])

  useEffect(() => {
    if (!active) return
    const currentId = imageIds[index]
    if (currentId && imageById.has(currentId)) return
    setImageIds([])
    setIndex(0)
  }, [active, imageById, imageIds, index])

  return {
    active,
    image,
    index,
    count: imageIds.length,
    mode,
    seconds,
    paused,
    setMode,
    setSeconds,
    start,
    showImage,
    stop,
    next,
    previous,
    togglePaused,
    preloadImages,
  }
}
