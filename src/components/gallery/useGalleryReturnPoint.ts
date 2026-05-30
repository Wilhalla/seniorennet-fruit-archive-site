import { useCallback, useEffect, useRef } from 'react'
import { currentBrowserPath } from '../../lib/browserHistory'

export const GALLERY_RETURN_STORAGE_KEY = 'seniorennet-fruit-gallery-return'
export const GALLERY_RETURN_MAX_AGE_MS = 10 * 60 * 1000

export function useGalleryReturnPoint(readyToRestore: boolean, restoreSignal: unknown) {
  const returnScrollAppliedRef = useRef(false)

  useEffect(() => {
    if (!readyToRestore || returnScrollAppliedRef.current) return undefined
    if (typeof window === 'undefined') return undefined

    let stored: { url?: string; scrollY?: number; savedAt?: number } | null = null
    try {
      const raw = window.sessionStorage.getItem(GALLERY_RETURN_STORAGE_KEY)
      stored = raw ? JSON.parse(raw) : null
    } catch {
      stored = null
    }

    if (!stored?.url || typeof stored.scrollY !== 'number') return undefined
    if (Date.now() - (stored.savedAt ?? 0) > GALLERY_RETURN_MAX_AGE_MS) return undefined
    if (stored.url !== currentBrowserPath()) return undefined

    returnScrollAppliedRef.current = true
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: stored.scrollY, left: 0, behavior: 'auto' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [readyToRestore, restoreSignal])

  return useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(GALLERY_RETURN_STORAGE_KEY, JSON.stringify({
        url: currentBrowserPath(),
        scrollY: window.scrollY,
        savedAt: Date.now(),
      }))
    } catch {
      // Ignore private browsing/storage failures; native history restoration can still help.
    }
  }, [])
}
