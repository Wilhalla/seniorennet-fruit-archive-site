import { useEffect, useRef, useState } from 'react'

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

export function useDismissHydrationLoader(loaderId: string, loading: boolean) {
  useEffect(() => {
    if (loading) return undefined
    const loader = document.getElementById(loaderId)
    if (!loader) return undefined

    const now = performance.now()
    const showAt = LOADER_SHOW_DELAY_MS
    if (now < showAt) {
      loader.remove()
      return undefined
    }

    let removeTimer: number | undefined
    const dismissTimer = window.setTimeout(() => {
      loader.classList.add('site-loader--dismissed')
      removeTimer = window.setTimeout(() => loader.remove(), LOADER_FADE_MS)
    }, Math.max(0, showAt + LOADER_MIN_VISIBLE_MS - now))

    return () => {
      window.clearTimeout(dismissTimer)
      if (removeTimer) window.clearTimeout(removeTimer)
    }
  }, [loaderId, loading])
}

export function useDismissGalleryHydrationLoader(loading: boolean) {
  useDismissHydrationLoader('gallery-hydration-loader', loading)
}
