import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_ATLAS_SCALE, MIN_ATLAS_SCALE, clamp, type ScreenPoint } from '../../lib/archiveAtlas'

type ScaleUpdater = number | ((currentScale: number) => number)

export function useAtlasViewport() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const scaleRef = useRef(1)
  const panRef = useRef<ScreenPoint>({ x: 0, y: 0 })
  const [scale, setScaleState] = useState(1)
  const [pan, setPanState] = useState<ScreenPoint>({ x: 0, y: 0 })
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const pendingPanRef = useRef<ScreenPoint | null>(null)
  const panFrameRef = useRef<number | null>(null)

  const setPan = useCallback((nextPan: ScreenPoint) => {
    panRef.current = nextPan
    pendingPanRef.current = nextPan
    if (panFrameRef.current !== null) return
    panFrameRef.current = window.requestAnimationFrame(() => {
      panFrameRef.current = null
      const pending = pendingPanRef.current
      pendingPanRef.current = null
      if (pending) setPanState(pending)
    })
  }, [])

  const setScale = useCallback((nextScaleOrUpdater: ScaleUpdater) => {
    const nextScale = typeof nextScaleOrUpdater === 'function'
      ? nextScaleOrUpdater(scaleRef.current)
      : nextScaleOrUpdater
    scaleRef.current = nextScale
    setScaleState(nextScale)
  }, [])

  const zoomAtCanvasPoint = useCallback((focus: ScreenPoint, factor: number) => {
    const scaleValue = scaleRef.current
    const panValue = panRef.current
    const nextScale = clamp(scaleValue * factor, MIN_ATLAS_SCALE, MAX_ATLAS_SCALE)
    const nextPan = {
      x: focus.x - ((focus.x - panValue.x) / scaleValue) * nextScale,
      y: focus.y - ((focus.y - panValue.y) / scaleValue) * nextScale,
    }
    scaleRef.current = nextScale
    panRef.current = nextPan
    pendingPanRef.current = null
    if (panFrameRef.current !== null) {
      window.cancelAnimationFrame(panFrameRef.current)
      panFrameRef.current = null
    }
    setScaleState(nextScale)
    setPanState(nextPan)
  }, [])

  scaleRef.current = scale
  if (pendingPanRef.current === null) panRef.current = pan

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const rect = canvas.getBoundingClientRect()
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top
      zoomAtCanvasPoint({ x: mx, y: my }, event.deltaY > 0 ? 0.88 : 1.14)
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [zoomAtCanvasPoint])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
      const maxDpr = coarsePointer ? 1.25 : 1.5
      const dpr = Math.min(maxDpr, Math.max(1, window.devicePixelRatio || 1))
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      const context = canvas.getContext('2d')
      context?.setTransform(dpr, 0, 0, dpr, 0, 0)
      setCanvasSize({ width: rect.width, height: rect.height })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      if (panFrameRef.current !== null) window.cancelAnimationFrame(panFrameRef.current)
    }
  }, [])

  return { canvasRef, canvasSize, dragStart, pan, setPan, scale, setScale, zoomAtCanvasPoint }
}
