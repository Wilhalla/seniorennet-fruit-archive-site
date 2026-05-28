import type { ReactNode } from 'react'

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
                className={isActive ? 'grid min-h-8 w-full grid-cols-1 items-center justify-items-center gap-2 whitespace-nowrap rounded-full bg-obsidian px-2 text-center text-sm font-medium text-eggshell md:min-h-7 md:grid-cols-[1fr_auto] md:justify-items-stretch md:px-3 md:text-left md:text-base' : 'grid min-h-8 w-full grid-cols-1 items-center justify-items-center gap-2 whitespace-nowrap rounded-full px-2 text-center text-sm text-slate-ink hover:bg-powder hover:text-obsidian md:min-h-7 md:grid-cols-[1fr_auto] md:justify-items-stretch md:px-3 md:text-left md:text-base'}
                type="button"
                key={item.year}
                aria-label={`Spring naar ${label}, ${item.count} items`}
                onClick={() => onSelect(item.year)}
              >
                <span>{label}</span>
                <span className="hidden font-mono text-xs md:inline">{item.count}</span>
              </button>
            )
          })}
        </nav>
        {footer && <div className="mt-4 max-md:hidden">{footer}</div>}
      </div>
    </aside>
  )
}
