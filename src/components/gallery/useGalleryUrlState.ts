import { useEffect, useState } from 'react'
import { writeBrowserPath } from '../../lib/browserHistory'
import { galleryFiltersFromUrlState, galleryUrlFromState, galleryViewerPageUrl, imageGalleryStateFromUrl, type GalleryFilters } from '../../lib/imageGallerySession'

export function useGalleryUrlState(filters: GalleryFilters, replaceFilters: (nextFilters: GalleryFilters) => void) {
  const [urlStateApplied, setUrlStateApplied] = useState(false)

  useEffect(() => {
    const applyUrlState = () => {
      const state = imageGalleryStateFromUrl(window.location.search)
      if (state.viewerId) {
        window.location.replace(galleryViewerPageUrl(state, window.location.hash))
        return true
      }
      replaceFilters(galleryFiltersFromUrlState(state))
      setUrlStateApplied(true)
      return false
    }

    const redirected = applyUrlState()
    if (redirected) setUrlStateApplied(false)
    window.addEventListener('popstate', applyUrlState)
    return () => window.removeEventListener('popstate', applyUrlState)
  }, [replaceFilters])

  useEffect(() => {
    if (typeof window === 'undefined' || !urlStateApplied) return
    const nextUrl = galleryUrlFromState(window.location.pathname, { ...filters, viewerId: null }, window.location.hash)
    writeBrowserPath(nextUrl, 'replace')
  }, [filters, urlStateApplied])
}
