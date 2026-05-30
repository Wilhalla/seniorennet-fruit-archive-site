import { useMemo, useRef } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { Calendar } from 'lucide-react'
import YearSelector from '../YearSelector'
import { GalleryFilterControls, GalleryHeader } from './GalleryControls'
import GalleryVirtualFeed from './GalleryVirtualFeed'
import {
  useDismissGalleryHydrationLoader,
  useActiveGalleryYear,
  useGalleryData,
  useGalleryFilters,
  useGalleryReturnPoint,
  useGallerySpeciesTags,
  useGalleryUrlState,
  useGracefulLoader,
  useResponsiveGalleryColumns,
} from './galleryClientHooks'
import {
  buildImageGallerySession,
  galleryViewerPageUrl,
  type GalleryGroups,
  type GalleryImageRecord as ImageRecord,
} from '../../lib/imageGallerySession'

type Props = {
  initialImages?: ImageRecord[]
  initialGroups?: GalleryGroups
}

export default function GalleryApp({ initialImages, initialGroups }: Props) {
  const galleryFeedRef = useRef<HTMLElement>(null)
  const { images, groups, initialDataLoading, fullIndexLoaded } = useGalleryData(initialImages, initialGroups)
  const { filters, hasActiveFilters, replaceFilters, resetFilters, setFilter } = useGalleryFilters()
  const { query, selectedYear, theme, speciesFilter, season, sortNewest } = filters
  const { speciesByImage, speciesTagsLoading } = useGallerySpeciesTags({ query, speciesFilter })
  const columns = useResponsiveGalleryColumns()

  useDismissGalleryHydrationLoader(initialDataLoading)

  const gallerySession = useMemo(() => buildImageGallerySession({
    images,
    filters,
    speciesByImage,
    groups,
    columns,
  }), [images, filters, speciesByImage, groups, columns])

  const {
    filtered,
    rows: galleryRows,
    visibleThemes,
    highPriorityThumbnailIds,
    eagerThumbnailIds,
  } = gallerySession
  const peopleCount = visibleThemes.find((item) => item.id === 'mensen')?.count ?? 0
  const plantCount = visibleThemes
    .filter((item) => ['appels', 'peren', 'pruimen', 'bessen', 'bloesem', 'tuin'].includes(item.id))
    .reduce((sum, item) => sum + item.count, 0)

  const galleryVirtualizer = useWindowVirtualizer({
    count: galleryRows.length,
    estimateSize: (index) => {
      const row = galleryRows[index]
      if (!row) return 220
      if (row.type === 'year') return 150
      if (row.type === 'month') return 74
      return columns >= 5 ? 220 : columns >= 4 ? 190 : 150
    },
    overscan: 8,
    scrollMargin: galleryFeedRef.current?.offsetTop ?? 0,
    getItemKey: (index) => galleryRows[index]?.key ?? index,
  })

  const virtualItems = galleryVirtualizer.getVirtualItems()
  const { activeYear, setActiveYear } = useActiveGalleryYear(initialGroups?.years?.[0]?.id ?? '', groups, galleryRows, virtualItems)
  const rememberGalleryReturnPoint = useGalleryReturnPoint(!initialDataLoading && fullIndexLoaded, galleryRows)

  useGalleryUrlState(filters, replaceFilters)

  function jumpToYear(year: string) {
    if (selectedYear && selectedYear !== year) setFilter('selectedYear', '')
    setActiveYear(year)

    const index = galleryRows.findIndex((row) => row.year === year)
    if (index >= 0) {
      galleryVirtualizer.scrollToIndex(index, { align: 'start', behavior: 'smooth' })
      return
    }

    setFilter('selectedYear', year)
    galleryFeedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function viewerHref(imageId: string) {
    return galleryViewerPageUrl({ ...filters, viewerId: imageId })
  }

  const supplementalLoader = useGracefulLoader(speciesTagsLoading)

  return (
    <section className="relative z-10 bg-eggshell pb-20 text-midnight-navy">
      {supplementalLoader.shouldRender && (
        <div className={`site-loader site-loader--controlled${supplementalLoader.isVisible ? ' site-loader--visible' : ''}`} role="status" aria-live="polite" aria-label="Beeldarchief laden">
          <div className="site-loader__mark" aria-hidden="true"></div>
          <div className="site-loader__text">
            <span>Blogarchief Daniël Willaeys</span>
            <small>beeldarchief laden</small>
          </div>
        </div>
      )}

      <div className="site-shell grid min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-4 pt-8 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8">
        <YearSelector
          items={groups.years.map((item) => ({ year: item.id, label: item.label, count: item.count }))}
          activeYear={activeYear}
          currentLabel="Actief"
          ariaLabel="Galerie jaren"
          className="min-w-0"
          onSelect={jumpToYear}
          onClear={() => setFilter('selectedYear', '')}
          clearLabel="Alle"
          footer={
            <button
              className="inline-flex min-h-8 items-center gap-2 text-sm text-gravel hover:text-obsidian"
              type="button"
              onClick={() => {
                setFilter('selectedYear', '')
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              Naar heden <Calendar className="size-4" aria-hidden="true" />
            </button>
          }
        />

        <main className="min-w-0 overflow-visible">
          <GalleryHeader
            filteredCount={filtered.length}
            peopleCount={peopleCount}
            plantCount={plantCount}
            sortNewest={sortNewest}
            onSortNewestChange={(nextSortNewest) => setFilter('sortNewest', nextSortNewest)}
          />

          <GalleryFilterControls
            groups={groups}
            hasActiveFilters={hasActiveFilters}
            query={query}
            season={season}
            theme={theme}
            onQueryChange={(nextQuery) => setFilter('query', nextQuery)}
            onReset={resetFilters}
            onSeasonChange={(nextSeason) => setFilter('season', nextSeason)}
            onThemeChange={(nextTheme) => setFilter('theme', nextTheme)}
          />

          <GalleryVirtualFeed
            columns={columns}
            eagerThumbnailIds={eagerThumbnailIds}
            feedRef={galleryFeedRef}
            groups={groups}
            highPriorityThumbnailIds={highPriorityThumbnailIds}
            rows={galleryRows}
            scrollMargin={galleryVirtualizer.options.scrollMargin}
            totalSize={galleryVirtualizer.getTotalSize()}
            virtualItems={virtualItems}
            viewerHref={viewerHref}
            onRememberReturnPoint={rememberGalleryReturnPoint}
          />
        </main>
      </div>
    </section>
  )
}
