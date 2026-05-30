import { useCallback, useState } from 'react'
import type { GalleryFilters } from '../../lib/imageGallerySession'

export const defaultGalleryFilters: GalleryFilters = {
  query: '',
  selectedYear: '',
  theme: 'all',
  speciesFilter: 'all',
  season: 'all',
  peoplePlantsOnly: false,
  sortNewest: true,
}

export function hasActiveGalleryFilters(filters: GalleryFilters) {
  return Boolean(
    filters.query.trim()
      || filters.theme !== 'all'
      || filters.speciesFilter !== 'all'
      || filters.selectedYear
      || filters.season !== 'all'
      || filters.peoplePlantsOnly
      || !filters.sortNewest,
  )
}

export function useGalleryFilters(initialFilters: Partial<GalleryFilters> = {}) {
  const [filters, setFilters] = useState<GalleryFilters>({ ...defaultGalleryFilters, ...initialFilters })

  const setFilter = useCallback(<Key extends keyof GalleryFilters>(key: Key, value: GalleryFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }, [])

  const replaceFilters = useCallback((nextFilters: GalleryFilters) => {
    setFilters(nextFilters)
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(defaultGalleryFilters)
  }, [])

  return {
    filters,
    hasActiveFilters: hasActiveGalleryFilters(filters),
    replaceFilters,
    resetFilters,
    setFilter,
  }
}
