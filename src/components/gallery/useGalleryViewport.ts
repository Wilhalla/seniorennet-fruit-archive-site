import { useEffect, useState } from 'react'
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

export function useActiveGalleryYear<TImage extends GalleryImageRecord>(initialYear: string, groups: GalleryGroups, rows: GalleryVirtualRow<TImage>[], virtualItems: Array<{ index: number }>) {
  const [activeYear, setActiveYear] = useState(initialYear)

  useEffect(() => {
    if (!activeYear && groups.years[0]?.id) setActiveYear(groups.years[0].id)
  }, [activeYear, groups.years])

  useEffect(() => {
    const firstVirtualItem = virtualItems[0]
    const year = firstVirtualItem
      ? rows[firstVirtualItem.index]?.year
      : rows.find((row) => row.type === 'year')?.year
    if (year) setActiveYear(year)
  }, [virtualItems, rows])

  return { activeYear, setActiveYear }
}
