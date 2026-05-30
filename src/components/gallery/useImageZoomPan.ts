import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type RefObject, type WheelEvent } from 'react'
import type { ImageSize } from './galleryViewerHooks'

export type ImageScaleMode = 'fit' | 'width' | 'height' | 'cover' | 'original'

export const ZOOM_MIN = 1.5
export const ZOOM_MAX = 6
export const ZOOM_STEP = 0.25
export const ZOOM_LENS_SIZE = 220
export const IMAGE_ZOOM_MIN = 1
export const IMAGE_ZOOM_MAX = 5
export const IMAGE_ZOOM_STEP = 0.25

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

type UseImageZoomPanOptions = {
  imageId?: string
  imageScaleMode: ImageScaleMode
  imageSize: ImageSize
  stageRef: RefObject<HTMLDivElement | null>
  imageRef: RefObject<HTMLImageElement | null>
  stageSize: ImageSize
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundedImageZoom(value: number) {
  const stepped = Math.round(value / IMAGE_ZOOM_STEP) * IMAGE_ZOOM_STEP
  return clampNumber(Number(stepped.toFixed(2)), IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX)
}

function distanceBetween(pointA: TouchPoint, pointB: TouchPoint) {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y)
}

export function useImageZoomPan({ imageId, imageScaleMode, imageSize, stageRef, imageRef, stageSize }: UseImageZoomPanOptions) {
  const [zoomEnabled, setZoomEnabled] = useState(false)
  const [zoomValue, setZoomValue] = useState(2.5)
  const [imageZoom, setImageZoom] = useState(IMAGE_ZOOM_MIN)
  const [imagePan, setImagePan] = useState<ImagePan>({ x: 0, y: 0 })
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

  zoomValueRef.current = zoomValue
  imageZoomRef.current = imageZoom
  imagePanRef.current = imagePan

  const imageZoomLabel = `${Math.round(imageZoom * 100)}%`
  const zoomValueLabel = zoomValue.toLocaleString('nl-BE', { maximumFractionDigits: 2 })
  const imageZoomChanged = imageZoom > IMAGE_ZOOM_MIN || Math.abs(imagePan.x) > 0.5 || Math.abs(imagePan.y) > 0.5

  const imageStyle = useMemo<CSSProperties | undefined>(() => {
    const style: CSSProperties = {}

    if (imageScaleMode === 'cover' && imageSize.width > 0 && imageSize.height > 0 && stageSize.width > 0 && stageSize.height > 0) {
      const imageAspect = imageSize.width / imageSize.height
      const stageAspect = stageSize.width / stageSize.height
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
  }, [imageScaleMode, imageSize.width, imageSize.height, stageSize.width, stageSize.height, imageZoomChanged, imagePan.x, imagePan.y, imageZoom])

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
    const stage = stageRef.current
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

  function clampImagePan(pan: ImagePan, zoom: number): ImagePan {
    const stage = stageRef.current
    const image = imageRef.current
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
    const stage = stageRef.current
    const image = imageRef.current

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

  function handleViewerImageWheel(event: WheelEvent<HTMLImageElement>) {
    if (!imageId) return
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

  useEffect(() => {
    if (zoomEnabled && zoomGeometryRef.current) applyZoomLens()
  }, [zoomValue, zoomEnabled])

  useEffect(() => {
    resetImageZoom()
  }, [imageId, imageScaleMode])

  useEffect(() => {
    hideZoomLens()
  }, [zoomEnabled])

  useEffect(() => () => hideZoomLens(), [])

  return {
    captureZoomRects,
    finishViewerImagePan,
    handleViewerImageDoubleClick,
    handleViewerImagePointerDown,
    handleViewerImagePointerMove,
    handleViewerImageWheel,
    hideZoomLens,
    imageStyle,
    imageZoom,
    imageZoomChanged,
    imageZoomLabel,
    resetImageZoom,
    setImageZoomAt,
    setZoomEnabled,
    setZoomValue,
    zoomEnabled,
    zoomLensRef,
    zoomValue,
    zoomValueLabel,
  }
}
