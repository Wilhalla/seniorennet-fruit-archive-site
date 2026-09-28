import type { ReactNode } from 'react'
import { yearPickerCountClass, yearPickerItemClass } from './yearPickerStyles'

export type YearSelectorItem = {
  year: string
  label?: string
  count: number
}

type Props = {
  items: YearSelectorItem[]
  activeYear: string
  title?: string
  currentLabel?: string
  ariaLabel?: string
  className?: string
  onSelect: (year: string) => void
  onClear?: () => void
  clearLabel?: string
  formatYear?: (year: string) => string
  footer?: ReactNode
}

function defaultFormatYear(year: string) {
  if (year === 'unknown' || year === 'ongedateerd') return 'Geen datum'
  return year
}

export default function YearSelector({
  items,
  activeYear,
  title = 'Jaren',
  currentLabel = 'Nu',
  ariaLabel = 'Spring naar jaar',
  className = '',
  onSelect,
  onClear,
  clearLabel = 'Alle jaren',
  formatYear = defaultFormatYear,
  footer,
}: Props) {
  const currentYear = activeYear || items[0]?.year || ''

  return (
    <aside className={`sticky top-16 self-start border-r border-chalk/80 pr-2 md:top-20 md:border-chalk md:pr-6 ${className}`} aria-label={ariaLabel}>
      <div className="max-h-[calc(100svh-4rem)] overflow-auto py-2 md:max-h-[calc(100vh-5rem)] md:py-5">
        <div className="flex items-center justify-between gap-3">
          <p className="m-0 text-body text-gravel max-md:sr-only">{title}</p>
          {onClear && (
            <button className="text-body text-gravel underline decoration-chalk underline-offset-4 hover:text-obsidian max-md:sr-only" type="button" onClick={onClear}>
              {clearLabel}
            </button>
          )}
        </div>
        <p className="my-3 text-gravel max-md:sr-only">
          {currentLabel}: <strong className="text-obsidian">{formatYear(currentYear)}</strong>
        </p>
        <nav className="grid gap-1 md:gap-0.5" aria-label={ariaLabel}>
          {items.map((item) => {
            const isActive = item.year === activeYear
            const label = item.label ?? formatYear(item.year)
            return (
              <button
                className={yearPickerItemClass}
                data-active={isActive ? 'true' : 'false'}
                type="button"
                key={item.year}
                aria-label={`Spring naar ${label}, ${item.count} items`}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => onSelect(item.year)}
              >
                <span>{label}</span>
                <span className={yearPickerCountClass}>{item.count}</span>
              </button>
            )
          })}
        </nav>
        {footer && <div className="mt-4 max-md:hidden">{footer}</div>}
      </div>
    </aside>
  )
}
