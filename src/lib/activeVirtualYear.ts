export type VirtualYearItem = {
  index: number
  start?: number
  size?: number
}

export const ACTIVE_YEAR_VIEWPORT_OFFSET = 96

export function activeYearFromVirtualItems<TEntry>(
  entries: readonly TEntry[],
  virtualItems: readonly VirtualYearItem[],
  yearOfEntry: (entry: TEntry) => string,
  viewportTop = 0,
) {
  const activeItem = virtualItems.find((item) => {
    if (typeof item.start !== 'number') return true
    const size = typeof item.size === 'number' ? item.size : 0
    return item.start + size > viewportTop
  }) ?? virtualItems.at(-1)

  const activeEntry = typeof activeItem?.index === 'number' ? entries[activeItem.index] : undefined
  const fallbackEntry = entries[0]
  return activeEntry ? yearOfEntry(activeEntry) : fallbackEntry ? yearOfEntry(fallbackEntry) : ''
}
