import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type WheelEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowLeft, ArrowRight, Calendar, ChevronDown, Download, ExternalLink, Images, Maximize2, Minimize2, RotateCcw, Scaling, ZoomIn, ZoomOut, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { GallerySlideshowControls, GallerySlideshowOverlay, useGallerySlideshow } from './GallerySlideshow'
import GalleryThumbnail from './GalleryThumbnail'
import { useGallerySpeciesTags } from './galleryClientHooks'
import { currentBrowserPath, sameOriginReferrer, writeBrowserPath } from '../../lib/browserHistory'
import { fetchGalleryJson, filterGalleryImages, formatImagePostDateTime, galleryFiltersFromUrlState, gallerySlideshowPageUrl, gallerySlideshowRoute, galleryUrlFromState, galleryViewerPageUrl, imageDownloadFilename, imageFullSrc, imageGalleryStateFromUrl, imageNumberLabel, relatedGalleryImages, type GalleryFilters, type GalleryImageRecord as ImageRecord } from '../../lib/imageGallerySession'

type Props = {
  initialImages?: ImageRecord[]
}

const ZOOM_MIN = 1.5
const ZOOM_MAX = 6
const ZOOM_STEP = 0.25
const ZOOM_LENS_SIZE = 220
const IMAGE_ZOOM_MIN = 1
const IMAGE_ZOOM_MAX = 5
const IMAGE_ZOOM_STEP = 0.25

type ZoomGeometry = {
  pointX: number
  pointY: number
  containerX: number
  containerY: number
  imageWidth: number
  imageHeight: number
}

type ImagePan = {
  x: number
  y: number
}

type ImagePanDrag = {
  pointerId: number
  startX: number
  startY: number
  panX: number
  panY: number
}

type TouchPoint = { x: number; y: number }
type PinchStart = { distance: number; zoom: number; pan: ImagePan }

type ImageSize = {
  width: number
  height: number
}

type ZoomRects = {
  imageLeft: number
  imageTop: number
  imageWidth: number
  imageHeight: number
  renderLeft: number
  renderTop: number
  renderWidth: number
  renderHeight: number
  stageLeft: number
  stageTop: number
}

type ImageScaleMode = 'fit' | 'width' | 'height' | 'cover' | 'original'

const IMAGE_SCALE_STORAGE_KEY = 'fruit-gallery-viewer-scale-mode'
const IMAGE_SCALE_OPTIONS: Array<{ value: ImageScaleMode; label: string; description: string }> = [
  { value: 'fit', label: 'Passend', description: 'Toon de volledige foto binnen het venster.' },
  { value: 'width', label: 'Breedte passend', description: 'Maak de foto zo breed als het kijkvlak; verticaal scrollen kan.' },
  { value: 'height', label: 'Hoogte passend', description: 'Gebruik de beschikbare hoogte, handig voor panorama’s.' },
  { value: 'cover', label: 'Vullen', description: 'Vul het hele kijkvlak zoals CSS cover; randen kunnen wegvallen.' },
  { value: 'original', label: 'Origineel formaat', description: 'Gebruik de echte pixelgrootte en scroll indien nodig.' },
]

function isImageScaleMode(value: string | null): value is ImageScaleMode {
  return IMAGE_SCALE_OPTIONS.some((option) => option.value === value)
}

function imageViewportClassName(scaleMode: ImageScaleMode, imageZoom: number) {
  if (scaleMode === 'cover') return 'absolute inset-0 grid place-items-center overflow-hidden'
  if (imageZoom > IMAGE_ZOOM_MIN) return 'absolute inset-0 grid place-items-center overflow-hidden p-4 lg:p-8'
  if (scaleMode === 'width' || scaleMode === 'original') return 'absolute inset-0 overflow-auto p-4 lg:p-8'
  return 'absolute inset-0 grid place-items-center overflow-hidden p-4 lg:p-8'
}

function imageElementClassName(scaleMode: ImageScaleMode, zoomEnabled: boolean, imageZoom: number) {
  const interaction = zoomEnabled ? ' cursor-none select-none' : imageZoom > IMAGE_ZOOM_MIN || scaleMode === 'cover' ? ' cursor-grab select-none touch-none active:cursor-grabbing' : ''
  if (scaleMode === 'cover') return `block h-full w-full max-w-none object-cover${interaction}`
  if (scaleMode === 'width') return `block h-auto w-full max-w-none object-contain${interaction}`
  if (scaleMode === 'height') return `block h-full w-auto max-w-none object-contain${interaction}`
  if (scaleMode === 'original') return `block h-auto w-auto max-w-none object-contain${interaction}`
  return `block h-auto w-auto max-h-full max-w-full object-contain${interaction}`
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundedImageZoom(value: number) {
  const stepped = Math.round(value / IMAGE_ZOOM_STEP) * IMAGE_ZOOM_STEP
  return clampNumber(Number(stepped.toFixed(2)), IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX)
}

export default function GalleryViewerApp({ initialImages = [] }: Props) {
  const [images, setImages] = useState<ImageRecord[]>(initialImages)
  const [imagesLoading, setImagesLoading] = useState(true)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [slideshowRequestedId, setSlideshowRequestedId] = useState<string | null>(null)
  const [filters, setFilters] = useState<GalleryFilters>({ query: '', selectedYear: '', theme: 'all', speciesFilter: 'all', season: 'all', peoplePlantsOnly: false, sortNewest: true })
  const [related, setRelated] = useState<Record<string, string[]>>({})
  const [relatedLoading, setRelatedLoading] = useState(false)
  const { speciesByImage } = useGallerySpeciesTags(filters)
  const [zoomEnabled, setZoomEnabled] = useState(false)
  const [zoomValue, setZoomValue] = useState(2.5)
  const [imageZoom, setImageZoom] = useState(IMAGE_ZOOM_MIN)
  const [imagePan, setImagePan] = useState<ImagePan>({ x: 0, y: 0 })
  const [viewerStageSize, setViewerStageSize] = useState<ImageSize>({ width: 0, height: 0 })
  const [viewerNaturalSize, setViewerNaturalSize] = useState<ImageSize | null>(null)
  const [imageScaleMode, setImageScaleMode] = useState<ImageScaleMode>('fit')
  const [imageScalePrefsReady, setImageScalePrefsReady] = useState(false)
  const [viewerFullscreen, setViewerFullscreen] = useState(false)
  const viewerImageStageRef = useRef<HTMLDivElement>(null)
  const viewerImageRef = useRef<HTMLImageElement>(null)
  const zoomLensRef = useRef<HTMLDivElement>(null)
  const zoomValueRef = useRef(zoomValue)
  const imageZoomRef = useRef(imageZoom)
  const imagePanRef = useRef(imagePan)
  const imagePanDragRef = useRef<ImagePanDrag | null>(null)
  const touchPointersRef = useRef<Map<number, TouchPoint>>(new Map())
  const pinchStartRef = useRef<PinchStart | null>(null)
  const zoomFrameRef = useRef<number | null>(null)
  const zoomGeometryRef = useRef<ZoomGeometry | null>(null)
  const zoomRectsRef = useRef<ZoomRects | null>(null)
  const viewerTimelineRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    const updateFullscreenState = () => setViewerFullscreen(document.fullscreenElement === viewerImageStageRef.current)
    updateFullscreenState()
    document.addEventListener('fullscreenchange', updateFullscreenState)
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchGalleryJson<ImageRecord[]>('/generated/image-index.client.json', 'high')
      .catch(() => fetchGalleryJson<ImageRecord[]>('/generated/image-index.json', 'high'))
      .then((loadedImages) => {
        if (!cancelled) setImages(loadedImages)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setImagesLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setRelatedLoading(true)
    fetchGalleryJson<Record<string, string[]>>('/generated/image-related.json', 'low')
      .then(setRelated)
      .catch(console.error)
      .finally(() => setRelatedLoading(false))
  }, [])

  useEffect(() => {
    const storedScaleMode = window.localStorage.getItem(IMAGE_SCALE_STORAGE_KEY)
    if (isImageScaleMode(storedScaleMode)) setImageScaleMode(storedScaleMode)
    setImageScalePrefsReady(true)
  }, [])

  useEffect(() => {
    const stage = viewerImageStageRef.current
    if (!stage) return undefined

    const updateStageSize = () => setViewerStageSize({ width: stage.clientWidth, height: stage.clientHeight })
    updateStageSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateStageSize)
      return () => window.removeEventListener('resize', updateStageSize)
    }

    const observer = new ResizeObserver(updateStageSize)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [viewerId])

  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images])
  const filtered = useMemo(() => filterGalleryImages(images, filters, speciesByImage), [images, filters, speciesByImage])
  const viewerImage = viewerId ? imageById.get(viewerId) ?? null : null
  const viewerImageFullSrc = viewerImage ? imageFullSrc(viewerImage) : ''
  const zoomValueLabel = zoomValue.toLocaleString('nl-BE', { maximumFractionDigits: 2 })
  const imageZoomLabel = `${Math.round(imageZoom * 100)}%`
  const imageZoomChanged = imageZoom > IMAGE_ZOOM_MIN || Math.abs(imagePan.x) > 0.5 || Math.abs(imagePan.y) > 0.5
  const currentScaleOption = IMAGE_SCALE_OPTIONS.find((option) => option.value === imageScaleMode) ?? IMAGE_SCALE_OPTIONS[0]
  const viewerImageSize = viewerImage ? { width: viewerImage.width || viewerNaturalSize?.width || 0, height: viewerImage.height || viewerNaturalSize?.height || 0 } : { width: 0, height: 0 }
  const viewerImageStyle = useMemo<CSSProperties | undefined>(() => {
    const style: CSSProperties = {}

    if (imageScaleMode === 'cover' && viewerImageSize.width > 0 && viewerImageSize.height > 0 && viewerStageSize.width > 0 && viewerStageSize.height > 0) {
      const imageAspect = viewerImageSize.width / viewerImageSize.height
      const stageAspect = viewerStageSize.width / viewerStageSize.height
      style.objectFit = 'contain'
      style.maxWidth = 'none'
      if (stageAspect > imageAspect) {
        style.width = '100%'
        style.height = 'auto'
      } else {
        style.width = 'auto'
        style.height = '100%'
      }
    }

    if (imageZoomChanged) {
      style.transform = `translate3d(${imagePan.x}px, ${imagePan.y}px, 0) scale(${imageZoom})`
      style.transformOrigin = 'center center'
      style.transition = imagePanDragRef.current ? 'none' : 'transform 120ms ease-out'
      style.willChange = 'transform'
    }

    return Object.keys(style).length > 0 ? style : undefined
  }, [imageScaleMode, viewerImageSize.width, viewerImageSize.height, viewerStageSize.width, viewerStageSize.height, imageZoomChanged, imagePan.x, imagePan.y, imageZoom])
  const viewerIndex = viewerImage ? filtered.findIndex((image) => image.id === viewerImage.id) : -1
  const previousImage = viewerIndex > 0 ? filtered[viewerIndex - 1] : null
  const nextImage = viewerIndex >= 0 && viewerIndex < filtered.length - 1 ? filtered[viewerIndex + 1] : null
  const similarImages = useMemo(() => relatedGalleryImages(viewerImage, images, imageById, related), [viewerImage, related, imageById, images])
  const viewerTimelineVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => viewerTimelineRef.current,
    estimateSize: () => 188,
    horizontal: true,
    overscan: 12,
    getItemKey: (index) => filtered[index]?.id ?? index,
  })
  const slideshow = useGallerySlideshow(filtered, imageById, viewerImage, { onEscape: exitSlideshowToGallery })
  const slideshowImageFullSrc = slideshow.image ? imageFullSrc(slideshow.image) : ''
  const slideshowImageMeta = slideshow.image ? formatImagePostDateTime(slideshow.image) : ''
  const slideshowPreloadSrcs = slideshow.preloadImages.map(imageFullSrc)

  function hrefFor(imageId: string) {
    return galleryViewerPageUrl({ ...filters, viewerId: imageId })
  }

  function galleryHref() {
    return galleryUrlFromState('/gallery/', { ...filters, viewerId: null })
  }

  function slideshowHrefFor(imageId: string) {
    return gallerySlideshowPageUrl({ ...filters, viewerId: imageId })
  }

  function replaceViewerImage(imageId: string) {
    setViewerId(imageId)
    hideZoomLens()
    const nextUrl = hrefFor(imageId)
    writeBrowserPath(nextUrl, 'replace')
  }

  function goBackToGallery() {
    if (sameOriginReferrer()) {
      window.history.back()
      return
    }
    window.location.href = '/gallery/'
  }

  function startSlideshow() {
    if (!viewerImage) return
    setZoomEnabled(false)
    hideZoomLens()
    const nextUrl = slideshowHrefFor(viewerImage.id)
    writeBrowserPath(nextUrl, 'push')
    slideshowRouteRef.current = true
    setSlideshowRequestedId(viewerImage.id)
    slideshow.start(viewerImage.id)
  }

  function closeSlideshow() {
    const imageId = slideshow.image?.id ?? viewerImage?.id
    slideshowRouteRef.current = false
    setSlideshowRequestedId(null)
    slideshow.stop()
    if (imageId) {
      setViewerId(imageId)
      writeBrowserPath(hrefFor(imageId), 'replace')
    }
  }

  function toggleViewerFullscreen() {
    const stage = viewerImageStageRef.current
    if (!stage) return
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {})
      return
    }
    void stage.requestFullscreen?.().catch(() => {})
  }

  function exitSlideshowToGallery() {
    slideshowRouteRef.current = false
    setSlideshowRequestedId(null)
    slideshow.stop()
    window.location.href = galleryHref()
  }

  useEffect(() => {
    if (!slideshowRequestedId) {
      if (slideshow.active) slideshow.stop()
      return
    }
    if (!imageById.has(slideshowRequestedId) || filtered.length === 0) return
    slideshowRouteRef.current = true
    slideshow.showImage(slideshowRequestedId)
  }, [slideshowRequestedId, imageById, filtered.length, slideshow.mode])

  useEffect(() => {
    if (!slideshow.active || !slideshow.image || !slideshowRouteRef.current) return
    if (window.location.pathname !== gallerySlideshowRoute) return
    const nextUrl = slideshowHrefFor(slideshow.image.id)
    if (nextUrl !== currentBrowserPath()) writeBrowserPath(nextUrl, 'push')
    if (slideshowRequestedId !== slideshow.image.id) setSlideshowRequestedId(slideshow.image.id)
  }, [slideshow.active, slideshow.image?.id, filters, slideshowRequestedId])

  function applyZoomLens() {
    zoomFrameRef.current = null
    const geometry = zoomGeometryRef.current
    const lens = zoomLensRef.current
    if (!geometry || !lens) return

    const zoom = zoomValueRef.current
    lens.style.opacity = '1'
    lens.style.transform = `translate3d(${geometry.containerX}px, ${geometry.containerY}px, 0) translate(-50%, -50%)`
    lens.style.backgroundSize = `${geometry.imageWidth * zoom}px ${geometry.imageHeight * zoom}px`
    lens.style.backgroundPosition = `${(ZOOM_LENS_SIZE / 2) - (geometry.pointX * zoom)}px ${(ZOOM_LENS_SIZE / 2) - (geometry.pointY * zoom)}px`
  }

  function queueZoomLensUpdate(geometry: ZoomGeometry) {
    zoomGeometryRef.current = geometry
    if (zoomFrameRef.current !== null) return
    zoomFrameRef.current = window.requestAnimationFrame(applyZoomLens)
  }

  function hideZoomLens() {
    zoomGeometryRef.current = null
    zoomRectsRef.current = null
    if (zoomFrameRef.current !== null) {
      window.cancelAnimationFrame(zoomFrameRef.current)
      zoomFrameRef.current = null
    }
    const lens = zoomLensRef.current
    if (lens) lens.style.opacity = '0'
  }

  function captureZoomRects(imageElement: HTMLImageElement) {
    const stage = viewerImageStageRef.current
    if (!stage) return null

    const imageRect = imageElement.getBoundingClientRect()
    if (imageRect.width <= 0 || imageRect.height <= 0) return null

    const stageRect = stage.getBoundingClientRect()
    const naturalWidth = imageElement.naturalWidth || imageRect.width
    const naturalHeight = imageElement.naturalHeight || imageRect.height
    const naturalAspect = naturalWidth / Math.max(1, naturalHeight)
    const boxAspect = imageRect.width / Math.max(1, imageRect.height)
    let renderLeft = 0
    let renderTop = 0
    let renderWidth = imageRect.width
    let renderHeight = imageRect.height

    if (imageScaleMode === 'cover' && Number.isFinite(naturalAspect) && naturalAspect > 0) {
      if (boxAspect > naturalAspect) {
        renderWidth = imageRect.width
        renderHeight = imageRect.width / naturalAspect
        renderTop = (imageRect.height - renderHeight) / 2
      } else {
        renderHeight = imageRect.height
        renderWidth = imageRect.height * naturalAspect
        renderLeft = (imageRect.width - renderWidth) / 2
      }
    }

    const rects: ZoomRects = {
      imageLeft: imageRect.left,
      imageTop: imageRect.top,
      imageWidth: imageRect.width,
      imageHeight: imageRect.height,
      renderLeft,
      renderTop,
      renderWidth,
      renderHeight,
      stageLeft: stageRect.left,
      stageTop: stageRect.top,
    }
    zoomRectsRef.current = rects
    return rects
  }

  function distanceBetween(pointA: TouchPoint, pointB: TouchPoint) {
    return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y)
  }

  function handleViewerImageDoubleClick(event: MouseEvent<HTMLImageElement>) {
    event.preventDefault()
    if (imageZoomRef.current > IMAGE_ZOOM_MIN) setImageZoomAt(IMAGE_ZOOM_MIN)
    else setImageZoomAt(Math.max(2.5, zoomValue), event.clientX, event.clientY)
  }

  function handleViewerImagePointerMove(event: PointerEvent<HTMLImageElement>) {
    if (event.pointerType !== 'mouse' && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const points = [...touchPointersRef.current.values()]
      if (points.length >= 2) {
        event.preventDefault()
        imagePanDragRef.current = null
        const pinchStart = pinchStartRef.current ?? {
          distance: Math.max(1, distanceBetween(points[0]!, points[1]!)),
          zoom: imageZoomRef.current,
          pan: imagePanRef.current,
        }
        pinchStartRef.current = pinchStart
        const nextZoom = roundedImageZoom(pinchStart.zoom * (distanceBetween(points[0]!, points[1]!) / Math.max(1, pinchStart.distance)))
        const nextPan = clampImagePan(pinchStart.pan, nextZoom)
        imageZoomRef.current = nextZoom
        imagePanRef.current = nextPan
        setZoomEnabled(false)
        setImageZoom(nextZoom)
        setImagePan(nextPan)
        hideZoomLens()
        return
      }
    }

    const drag = imagePanDragRef.current
    if (drag && drag.pointerId === event.pointerId) {
      const nextPan = clampImagePan({ x: drag.panX + event.clientX - drag.startX, y: drag.panY + event.clientY - drag.startY }, imageZoomRef.current)
      imagePanRef.current = nextPan
      setImagePan(nextPan)
      return
    }

    if (!zoomEnabled || event.pointerType !== 'mouse') return
    const rects = zoomRectsRef.current ?? captureZoomRects(event.currentTarget)
    if (!rects) return

    const localX = event.clientX - rects.imageLeft
    const localY = event.clientY - rects.imageTop
    const renderedX = Math.min(rects.renderWidth, Math.max(0, localX - rects.renderLeft))
    const renderedY = Math.min(rects.renderHeight, Math.max(0, localY - rects.renderTop))

    queueZoomLensUpdate({
      pointX: renderedX,
      pointY: renderedY,
      containerX: event.clientX - rects.stageLeft,
      containerY: event.clientY - rects.stageTop,
      imageWidth: rects.renderWidth,
      imageHeight: rects.renderHeight,
    })
  }

  function clampImagePan(pan: ImagePan, zoom: number): ImagePan {
    const stage = viewerImageStageRef.current
    const image = viewerImageRef.current
    const canPanAtCurrentScale = imageScaleMode === 'cover' || zoom > IMAGE_ZOOM_MIN
    if (!stage || !image || !canPanAtCurrentScale) return { x: 0, y: 0 }

    const stageRect = stage.getBoundingClientRect()
    const imageRect = image.getBoundingClientRect()
    const currentZoom = imageZoomRef.current || IMAGE_ZOOM_MIN
    const baseWidth = imageRect.width / currentZoom
    const baseHeight = imageRect.height / currentZoom
    const panSlack = imageScaleMode === 'cover' ? 0 : 80
    const maxX = Math.max(0, ((baseWidth * zoom) - stageRect.width) / 2 + panSlack)
    const maxY = Math.max(0, ((baseHeight * zoom) - stageRect.height) / 2 + panSlack)

    return {
      x: clampNumber(pan.x, -maxX, maxX),
      y: clampNumber(pan.y, -maxY, maxY),
    }
  }

  function setImageZoomAt(nextZoomValue: number, clientX?: number, clientY?: number) {
    const nextZoom = roundedImageZoom(nextZoomValue)
    if (nextZoom <= IMAGE_ZOOM_MIN) {
      imageZoomRef.current = IMAGE_ZOOM_MIN
      imagePanRef.current = { x: 0, y: 0 }
      setImageZoom(IMAGE_ZOOM_MIN)
      setImagePan({ x: 0, y: 0 })
      hideZoomLens()
      return
    }

    setZoomEnabled(false)

    const currentZoom = imageZoomRef.current
    const currentPan = imagePanRef.current
    let nextPan = currentPan
    const stage = viewerImageStageRef.current
    const image = viewerImageRef.current

    if (stage && image && typeof clientX === 'number' && typeof clientY === 'number') {
      const stageRect = stage.getBoundingClientRect()
      const imageRect = image.getBoundingClientRect()
      const baseCenterX = imageRect.left - stageRect.left + (imageRect.width / 2) - currentPan.x
      const baseCenterY = imageRect.top - stageRect.top + (imageRect.height / 2) - currentPan.y
      const pointerX = clientX - stageRect.left
      const pointerY = clientY - stageRect.top
      const ratio = nextZoom / currentZoom

      nextPan = {
        x: pointerX - baseCenterX - ((pointerX - baseCenterX - currentPan.x) * ratio),
        y: pointerY - baseCenterY - ((pointerY - baseCenterY - currentPan.y) * ratio),
      }
    }

    const clampedPan = clampImagePan(nextPan, nextZoom)
    imageZoomRef.current = nextZoom
    imagePanRef.current = clampedPan
    setImageZoom(nextZoom)
    setImagePan(clampedPan)
    hideZoomLens()
  }

  function resetImageZoom() {
    imageZoomRef.current = IMAGE_ZOOM_MIN
    imagePanRef.current = { x: 0, y: 0 }
    setImageZoom(IMAGE_ZOOM_MIN)
    setImagePan({ x: 0, y: 0 })
    imagePanDragRef.current = null
    touchPointersRef.current.clear()
    pinchStartRef.current = null
    hideZoomLens()
  }

  function handleViewerImageWheel(event: WheelEvent<HTMLImageElement>) {
    if (!viewerImage) return
    event.preventDefault()
    const direction = event.deltaY < 0 ? 1 : -1
    setImageZoomAt(imageZoomRef.current + (direction * IMAGE_ZOOM_STEP), event.clientX, event.clientY)
  }

  function handleViewerImagePointerDown(event: PointerEvent<HTMLImageElement>) {
    if (event.pointerType !== 'mouse') {
      event.currentTarget.setPointerCapture?.(event.pointerId)
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const points = [...touchPointersRef.current.values()]
      if (points.length >= 2) {
        event.preventDefault()
        pinchStartRef.current = {
          distance: Math.max(1, distanceBetween(points[0]!, points[1]!)),
          zoom: imageZoomRef.current,
          pan: imagePanRef.current,
        }
        imagePanDragRef.current = null
        return
      }
    }

    if (zoomEnabled || (imageZoomRef.current <= IMAGE_ZOOM_MIN && imageScaleMode !== 'cover')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    imagePanDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: imagePanRef.current.x,
      panY: imagePanRef.current.y,
    }
  }

  function finishViewerImagePan(event: PointerEvent<HTMLImageElement>) {
    if (event.pointerType !== 'mouse') {
      touchPointersRef.current.delete(event.pointerId)
      if (touchPointersRef.current.size < 2) pinchStartRef.current = null
    }

    const drag = imagePanDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    imagePanDragRef.current = null
  }

  async function downloadViewerImage() {
    if (!viewerImage) return

    const filename = imageDownloadFilename(viewerImage)
    try {
      const response = await fetch(imageFullSrc(viewerImage))
      if (!response.ok) throw new Error(`Download failed: ${response.status}`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      console.error(error)
      const link = document.createElement('a')
      link.href = imageFullSrc(viewerImage)
      link.download = filename
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
    }
  }

  useEffect(() => {
    imageZoomRef.current = imageZoom
  }, [imageZoom])

  useEffect(() => {
    imagePanRef.current = imagePan
  }, [imagePan])

  useEffect(() => {
    if (imageScalePrefsReady) window.localStorage.setItem(IMAGE_SCALE_STORAGE_KEY, imageScaleMode)
    resetImageZoom()
  }, [imageScaleMode, imageScalePrefsReady])

  useEffect(() => {
    zoomValueRef.current = zoomValue
    if (zoomEnabled && zoomGeometryRef.current) applyZoomLens()
  }, [zoomValue, zoomEnabled])

  useEffect(() => {
    setViewerNaturalSize(null)
    resetImageZoom()
  }, [viewerImage?.id])

  useEffect(() => {
    hideZoomLens()
  }, [zoomEnabled])

  useEffect(() => () => hideZoomLens(), [])

  useEffect(() => {
    if (!viewerImage || slideshow.active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') goBackToGallery()
      if (event.key === 'ArrowLeft' && previousImage) replaceViewerImage(previousImage.id)
      if (event.key === 'ArrowRight' && nextImage) replaceViewerImage(nextImage.id)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [viewerImage, previousImage, nextImage, slideshow.active])

  useEffect(() => {
    if (!viewerImage || viewerIndex < 0) return
    const frame = window.requestAnimationFrame(() => {
      viewerTimelineVirtualizer.measure()
      viewerTimelineVirtualizer.scrollToIndex(viewerIndex, { align: 'center' })
      const scroller = viewerTimelineRef.current
      if (scroller) {
        const itemSize = 188
        scroller.scrollLeft = Math.max(0, viewerIndex * itemSize - (scroller.clientWidth - itemSize) / 2)
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [viewerImage, viewerIndex, viewerTimelineVirtualizer])

  useEffect(() => {
    if (!viewerImage) return undefined
    const links = [previousImage, nextImage]
      .filter((image): image is ImageRecord => Boolean(image))
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

  if (!viewerId) {
    return (
      <main className="site-shell py-16 text-midnight-navy">
        <p className="eyebrow">Beeldviewer</p>
        <h1 className="display-title">Geen beeld gekozen</h1>
        <a className="mt-6 inline-flex min-h-10 items-center rounded-full border border-obsidian px-4 text-sm font-medium no-underline" href="/gallery/">Naar het beeldarchief</a>
      </main>
    )
  }

  if (!viewerImage) {
    if (slideshowRequestedId) {
      return (
        <main className="grid min-h-[100svh] place-items-center bg-black text-eggshell">
          <p className="m-0 text-sm text-eggshell/70">Diashow laden…</p>
        </main>
      )
    }

    return (
      <main className="site-shell py-16 text-midnight-navy">
        <p className="eyebrow">Beeldviewer</p>
        <h1 className="display-title">{imagesLoading ? 'Beeld laden…' : 'Beeld niet gevonden'}</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-gravel">{imagesLoading ? 'We zoeken de foto in het beeldarchief.' : 'Deze link verwijst naar een beeld dat niet in de index staat.'}</p>
        <a className="mt-6 inline-flex min-h-10 items-center rounded-full border border-obsidian px-4 text-sm font-medium no-underline" href="/gallery/">Naar het beeldarchief</a>
      </main>
    )
  }

  if (slideshowRequestedId && !slideshow.active) {
    return (
      <main className="grid min-h-[100svh] place-items-center bg-black text-eggshell">
        <p className="m-0 text-sm text-eggshell/70">Diashow laden…</p>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100svh-4rem)] w-full overflow-x-hidden bg-eggshell text-midnight-navy lg:flex lg:h-[calc(100svh-4rem)] lg:max-h-[calc(100svh-4rem)] lg:flex-col lg:overflow-hidden">
      <header className="sticky top-14 z-40 flex h-14 shrink-0 items-center justify-between gap-3 overflow-hidden border-b border-chalk bg-eggshell/95 px-4 backdrop-blur md:px-6 lg:static">
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-medium text-obsidian">{viewerImage.postTitle}</p>
          <p className="m-0 text-xs text-gravel">{formatImagePostDateTime(viewerImage)}{imageNumberLabel(viewerImage)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button className="hidden min-h-9 items-center gap-2 rounded-full border border-chalk px-3 text-sm text-obsidian hover:border-slate md:inline-flex" type="button" onClick={goBackToGallery}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Terug
          </button>
          <a className="inline-flex min-h-9 items-center gap-2 rounded-full border border-obsidian bg-obsidian px-3 text-sm font-medium text-eggshell no-underline hover:text-eggshell" href={`/posts/${viewerImage.postSlug}/`}>
            Lees artikel <ExternalLink className="size-4" aria-hidden="true" />
          </a>
          <button className="inline-grid size-9 place-items-center rounded-full border border-chalk text-obsidian hover:border-slate" type="button" onClick={goBackToGallery} aria-label="Sluit beeldviewer"><X className="size-4" aria-hidden="true" /></button>
        </div>
      </header>

      <div className="block w-full min-w-0 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-1 lg:overflow-hidden">
        <div ref={viewerImageStageRef} className="relative min-h-[72svh] w-full min-w-0 overflow-hidden border-b border-chalk bg-powder/40 lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className={imageViewportClassName(imageScaleMode, imageZoom)} onScroll={hideZoomLens}>
            <img
              ref={viewerImageRef}
              className={`${imageElementClassName(imageScaleMode, zoomEnabled, imageZoom)} touch-none`}
              style={viewerImageStyle}
              src={viewerImageFullSrc}
              alt={viewerImage.caption || viewerImage.postTitle}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              draggable={false}
              onLoad={(event) => setViewerNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              onWheel={handleViewerImageWheel}
              onPointerEnter={(event) => { if (zoomEnabled) captureZoomRects(event.currentTarget) }}
              onDoubleClick={handleViewerImageDoubleClick}
              onPointerDown={handleViewerImagePointerDown}
              onPointerMove={handleViewerImagePointerMove}
              onPointerUp={finishViewerImagePan}
              onPointerLeave={(event) => { finishViewerImagePan(event); hideZoomLens() }}
              onPointerCancel={(event) => { finishViewerImagePan(event); hideZoomLens() }}
            />
          </div>
          {zoomEnabled && (
            <div
              ref={zoomLensRef}
              className="pointer-events-none absolute left-0 top-0 z-20 rounded-full border border-eggshell/95 bg-no-repeat opacity-0 shadow-[0_18px_60px_rgba(19,24,32,0.34),inset_0_0_0_1px_rgba(19,24,32,0.25)] ring-1 ring-obsidian/20 will-change-transform"
              style={{ width: ZOOM_LENS_SIZE, height: ZOOM_LENS_SIZE, backgroundImage: `url(\"${viewerImageFullSrc.replace(/\"/g, '\\\"')}\")` }}
              aria-hidden="true"
            />
          )}
          {viewerFullscreen && (
            <div className="pointer-events-none absolute bottom-4 left-4 z-20 max-w-[min(34rem,calc(100%-2rem))] rounded-2xl border border-eggshell/20 bg-obsidian/75 px-4 py-3 text-eggshell shadow-soft backdrop-blur">
              <p className="m-0 line-clamp-2 text-sm font-medium leading-5">{viewerImage.caption || viewerImage.postTitle}</p>
              <p className="m-0 mt-1 text-xs text-eggshell/70">{formatImagePostDateTime(viewerImage)}{imageNumberLabel(viewerImage)}</p>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 top-3 z-30 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] grid-rows-[auto_1fr_auto] items-start gap-2 lg:inset-x-4 lg:bottom-auto lg:top-4 lg:grid-rows-1">
            <button className="pointer-events-auto inline-flex min-h-9 items-center justify-self-start gap-2 rounded-full border border-chalk bg-eggshell/90 px-3 text-sm text-obsidian disabled:opacity-30" type="button" disabled={!previousImage} onClick={() => previousImage && replaceViewerImage(previousImage.id)}>
              <ArrowLeft className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Vorige</span>
            </button>
            <div className="pointer-events-auto col-span-3 row-start-3 flex max-w-full flex-nowrap items-center justify-start gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-full border border-chalk bg-eggshell/95 px-3 py-2 text-sm text-obsidian shadow-soft [scrollbar-width:none] backdrop-blur [&::-webkit-scrollbar]:hidden lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:max-w-[min(calc(100vw-12rem),80rem)] [&_svg]:size-4" role="toolbar" aria-label="Beeldviewer acties">
              <GallerySlideshowControls mode={slideshow.mode} seconds={slideshow.seconds} disabled={filtered.length === 0} onModeChange={slideshow.setMode} onSecondsChange={slideshow.setSeconds} onStart={startSlideshow} />
              <Button className="h-10 w-10 shrink-0 px-0" variant="outline" size="icon" type="button" onClick={toggleViewerFullscreen} aria-label={viewerFullscreen ? 'Verlaat volledig scherm' : 'Volledig scherm'} title={viewerFullscreen ? 'Verlaat volledig scherm' : 'Volledig scherm'}>
                {viewerFullscreen ? <Minimize2 className="size-4" aria-hidden="true" /> : <Maximize2 className="size-4" aria-hidden="true" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-10 shrink-0 gap-2 px-4 max-sm:hidden" variant="outline" size="sm" type="button" title={`Schaal: ${currentScaleOption.label}`}>
                    <Scaling className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">{currentScaleOption.label}</span><ChevronDown className="size-3" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-72 border border-chalk bg-eggshell text-obsidian">
                  <DropdownMenuLabel>Afbeelding schalen</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup value={imageScaleMode} onValueChange={(value) => { if (isImageScaleMode(value)) setImageScaleMode(value) }}>
                    {IMAGE_SCALE_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem className="items-start gap-2 px-2 py-2 pr-8" key={option.value} value={option.value}>
                        <span className="grid gap-0.5">
                          <span className="text-sm font-medium leading-4">{option.label}</span>
                          <span className="text-xs leading-4 text-gravel">{option.description}</span>
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-chalk bg-pure-surface px-2" role="group" aria-label="Afbeelding in- en uitzoomen">
                <Button className="size-8 px-0" variant="ghost" size="icon" type="button" onClick={() => setImageZoomAt(imageZoom - IMAGE_ZOOM_STEP)} disabled={imageZoom <= IMAGE_ZOOM_MIN} aria-label="Zoom uit" title="Zoom uit">
                  <ZoomOut className="size-4" aria-hidden="true" />
                </Button>
                <span className="min-w-12 text-center font-mono text-sm text-gravel" aria-live="polite">{imageZoomLabel}</span>
                <Button className="size-8 px-0" variant="ghost" size="icon" type="button" onClick={() => setImageZoomAt(imageZoom + IMAGE_ZOOM_STEP)} disabled={imageZoom >= IMAGE_ZOOM_MAX} aria-label="Zoom in" title="Zoom in">
                  <ZoomIn className="size-4" aria-hidden="true" />
                </Button>
                {imageZoomChanged && (
                  <Button className="size-8 px-0" variant="ghost" size="icon" type="button" onClick={resetImageZoom} aria-label="Reset zoom" title="Reset zoom">
                    <RotateCcw className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
              <Button className="h-10 shrink-0 gap-2 px-4 max-sm:hidden" variant={zoomEnabled ? 'default' : 'outline'} size="sm" type="button" aria-pressed={zoomEnabled} aria-label="Vergrootglas" title="Vergrootglas" onClick={() => setZoomEnabled((current) => { if (!current) resetImageZoom(); return !current })}>
                <ZoomIn className="size-4" aria-hidden="true" /> <span className="hidden 2xl:inline">Vergrootglas</span>
              </Button>
              <Button className="h-10 w-10 shrink-0 px-0" variant="outline" size="icon" type="button" onClick={downloadViewerImage} aria-label="Download originele afbeelding" title="Download originele afbeelding">
                <Download className="size-4" aria-hidden="true" />
              </Button>
              <Button className="h-10 w-10 shrink-0 px-0" variant="outline" size="icon" asChild>
                <a href={viewerImageFullSrc} target="_blank" rel="noreferrer" aria-label="Open afbeelding in nieuw tabblad" title="Open afbeelding in nieuw tabblad">
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </Button>
              {zoomEnabled && (
                <label className="flex shrink-0 items-center gap-2 pl-1">
                  <span className="sr-only">Zoomwaarde</span>
                  <input className="h-1 w-32 accent-obsidian md:w-44" type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} value={zoomValue} onChange={(event) => setZoomValue(Number(event.currentTarget.value))} />
                  <span className="w-10 text-right font-mono text-xs">{zoomValueLabel}×</span>
                </label>
              )}
            </div>
            <button className="pointer-events-auto inline-flex min-h-9 items-center justify-self-end gap-2 rounded-full border border-chalk bg-eggshell/90 px-3 text-sm text-obsidian disabled:opacity-30" type="button" disabled={!nextImage} onClick={() => nextImage && replaceViewerImage(nextImage.id)}>
              <span className="hidden sm:inline">Volgende</span> <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <aside className="bg-eggshell lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
          <section className="border-b border-chalk p-4 md:p-5">
            <h1 className="m-0 text-base font-medium leading-snug text-obsidian">{viewerImage.caption || viewerImage.postTitle}</h1>
            <p className="m-0 mt-1 text-xs text-gravel">{formatImagePostDateTime(viewerImage)}</p>
            {viewerImage.excerpt && <p className="m-0 mt-3 text-sm leading-6 text-gravel">{viewerImage.excerpt}</p>}
            <a className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-full border border-obsidian bg-obsidian px-3 text-sm font-medium text-eggshell no-underline hover:text-eggshell" href={`/posts/${viewerImage.postSlug}/`}>
              Lees het artikel bij deze foto <ExternalLink className="size-4" aria-hidden="true" />
            </a>
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Beeldtags">
              {viewerImage.visualTags.slice(0, 6).map((tag) => (
                <span className="inline-flex min-h-7 items-center rounded-full border border-chalk px-2.5 text-xs text-obsidian" key={tag}>{tag}</span>
              ))}
              <span className="inline-flex min-h-7 items-center rounded-full border border-chalk px-2.5 font-mono text-xs text-gravel">{viewerImage.season}</span>
              {viewerImage.year && <span className="inline-flex min-h-7 items-center rounded-full border border-chalk px-2.5 font-mono text-xs text-gravel">{viewerImage.year}</span>}
            </div>
          </section>

          <section className="border-b border-chalk p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="m-0 inline-flex items-center gap-2 text-sm font-medium text-obsidian"><Calendar className="size-4" aria-hidden="true" /> Tijdlijn</h2>
                <p className="m-0 mt-1 text-xs text-gravel">Scroll door de huidige beeldselectie.</p>
              </div>
              <span className="font-mono text-xs text-gravel">{viewerIndex >= 0 ? `${viewerIndex + 1}/${filtered.length}` : ''}</span>
            </div>
            <div ref={viewerTimelineRef} className="h-48 overflow-x-auto border border-chalk" aria-label="Chronologische beeldtijdlijn">
              <div className="relative h-full" style={{ width: `${viewerTimelineVirtualizer.getTotalSize()}px` }}>
                {viewerTimelineVirtualizer.getVirtualItems().map((virtualItem) => {
                  const image = filtered[virtualItem.index]
                  if (!image) return null
                  const active = image.id === viewerImage.id
                  return (
                    <button
                      className={active ? 'absolute top-0 h-full border border-obsidian bg-eggshell p-1 text-left' : 'absolute top-0 h-full border-r border-chalk bg-eggshell p-1 text-left hover:bg-powder'}
                      key={virtualItem.key}
                      type="button"
                      onClick={() => replaceViewerImage(image.id)}
                      aria-current={active ? 'true' : undefined}
                      style={{ width: `${Math.max(1, virtualItem.size - 6)}px`, transform: `translateX(${virtualItem.start}px)` }}
                    >
                      <GalleryThumbnail className="aspect-[4/3] w-full object-cover" image={image} alt="" loading="lazy" fetchPriority="low" decoding="async" />
                      <span className="line-clamp-2 pt-1 text-[10px] leading-3 text-obsidian">{image.postTitle}</span>
                      <span className="block truncate pt-0.5 font-mono text-[9px] text-gravel">{formatImagePostDateTime(image)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="m-0 inline-flex items-center gap-2 text-sm font-medium text-obsidian"><Images className="size-4" aria-hidden="true" /> Visueel gerelateerd</h2>
              {relatedLoading && <span className="text-xs text-gravel">laden…</span>}
            </div>
            {similarImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {similarImages.map((image) => (
                  <button className="group grid gap-2 border border-chalk p-1 text-left hover:border-slate" key={image.id} type="button" onClick={() => replaceViewerImage(image.id)}>
                    <GalleryThumbnail className="aspect-[4/3] w-full object-cover" image={image} alt="" loading="lazy" fetchPriority="low" decoding="async" />
                    <span className="px-1 pb-1">
                      <span className="line-clamp-2 text-xs leading-4 text-gravel">{image.postTitle}</span>
                      <span className="mt-1 block truncate font-mono text-[10px] text-gravel/75">{formatImagePostDateTime(image)}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm leading-6 text-gravel">Geen gerelateerde beelden gevonden.</p>
            )}
          </section>
        </aside>
      </div>

      {slideshow.active && (
        <GallerySlideshowOverlay
          image={slideshow.image}
          imageSrc={slideshowImageFullSrc}
          imageMeta={slideshowImageMeta}
          preloadSrcs={slideshowPreloadSrcs}
          index={slideshow.index}
          count={slideshow.count}
          mode={slideshow.mode}
          seconds={slideshow.seconds}
          paused={slideshow.paused}
          onModeChange={slideshow.setMode}
          onSecondsChange={slideshow.setSeconds}
          onTogglePaused={slideshow.togglePaused}
          onPrevious={slideshow.previous}
          onNext={slideshow.next}
          onClose={closeSlideshow}
        />
      )}
    </main>
  )
}
