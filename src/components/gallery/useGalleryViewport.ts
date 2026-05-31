import { useEffect, useState } from 'react'
import { ACTIVE_YEAR_VIEWPORT_OFFSET, activeYearFromVirtualItems, type VirtualYearItem } from '../../lib/activeVirtualYear'
import { columnsForGalleryWidth, type GalleryGroups, type GalleryImageRecord, type GalleryVirtualRow } from '../../lib/imageGallerySession'

export function useResponsiveGalleryColumns() {
  const [columns, setColumns] = useState(10)

  useEffect(() => {
    const updateColumns = () => setColumns(columnsForGalleryWidth(window.innerWidth))
    updateColumns()
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [])

  return columns
}

export function useActiveGalleryYear<TImage extends GalleryImageRecord>(initialYear: string, groups: GalleryGroups, rows: GalleryVirtualRow<TImage>[], virtualItems: VirtualYearItem[]) {
  const [activeYear, setActiveYear] = useState(initialYear)

  useEffect(() => {
    if (!activeYear && groups.years[0]?.id) setActiveYear(groups.years[0].id)
  }, [activeYear, groups.years])

  useEffect(() => {
    const viewportTop = typeof window === 'undefined' ? 0 : window.scrollY + ACTIVE_YEAR_VIEWPORT_OFFSET
    const year = activeYearFromVirtualItems(rows, virtualItems, (row) => row.year, viewportTop)
    if (year) setActiveYear(year)
  }, [virtualItems, rows])

  return { activeYear, setActiveYear }
}
