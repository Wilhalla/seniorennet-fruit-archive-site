import { useEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { Calendar, RotateCcw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import YearSelector from '../YearSelector'
import GalleryThumbnail from './GalleryThumbnail'
import { LOADER_FADE_MS, LOADER_MIN_VISIBLE_MS, LOADER_SHOW_DELAY_MS, useGallerySpeciesTags, useGracefulLoader } from './galleryClientHooks'
import { currentBrowserPath, writeBrowserPath } from '../../lib/browserHistory'
import { buildGalleryRows, columnsForGalleryWidth, emptyGalleryGroups, fetchGalleryJson, filterGalleryImages, galleryUrlFromState, galleryViewerPageUrl, imageGalleryStateFromUrl, visibleGalleryThemes, type GalleryGroups, type GalleryImageRecord as ImageRecord, type GalleryVirtualRow } from '../../lib/imageGallerySession'

type Props = {
  initialImages?: ImageRecord[]
  initialGroups?: GalleryGroups
}

const MIN_HIGH_PRIORITY_THUMBNAILS = 6
const MIN_EAGER_THUMBNAILS = 12
const GALLERY_RETURN_STORAGE_KEY = 'seniorennet-fruit-gallery-return'
const GALLERY_RETURN_MAX_AGE_MS = 10 * 60 * 1000

export default function GalleryApp({ initialImages, initialGroups }: Props) {
  const [images, setImages] = useState<ImageRecord[]>(initialImages ?? [])
  const [groups, setGroups] = useState<GalleryGroups>(initialGroups ?? emptyGalleryGroups)
  const [initialDataLoading, setInitialDataLoading] = useState(!initialImages || !initialGroups)
  const [fullIndexLoaded, setFullIndexLoaded] = useState(!initialImages)
  const [query, setQuery] = useState('')
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [theme, setTheme] = useState('all')
  const speciesFilter = 'all'
  const [season, setSeason] = useState('all')
  const [peoplePlantsOnly, setPeoplePlantsOnly] = useState(false)
  const [sortNewest, setSortNewest] = useState(true)
  const [activeYear, setActiveYear] = useState<string>(initialGroups?.years?.[0]?.id ?? '')
  const [columns, setColumns] = useState(10)
  const galleryFeedRef = useRef<HTMLElement>(null)
  const urlStateAppliedRef = useRef(false)
  const returnScrollAppliedRef = useRef(false)
  const { speciesByImage, speciesTagsLoading } = useGallerySpeciesTags({ query, speciesFilter })

  useEffect(() => {
    if (initialDataLoading) return undefined
    const loader = document.getElementById('gallery-hydration-loader')
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
  }, [initialDataLoading])

  useEffect(() => {
    if (!initialDataLoading) return
    Promise.all([
      fetchGalleryJson<ImageRecord[]>('/generated/image-index.client.json').catch(() => fetchGalleryJson<ImageRecord[]>('/generated/image-index.json')),
      fetchGalleryJson<GalleryGroups>('/generated/gallery-groups.json'),
    ])
      .then(([loadedImages, loadedGroups]) => {
        setImages(loadedImages)
        setFullIndexLoaded(true)
        setGroups(loadedGroups)
        setActiveYear(loadedGroups.years?.[0]?.id ?? '')
      })
      .catch(console.error)
      .finally(() => setInitialDataLoading(false))
  }, [initialDataLoading])

  useEffect(() => {
    if (!initialImages || initialDataLoading) return undefined

    let cancelled = false
    let timeoutHandle: unknown
    let idleHandle: ReturnType<typeof window.requestIdleCallback> | undefined

    const loadFullIndex = () => {
      fetchGalleryJson<ImageRecord[]>('/generated/image-index.client.json', 'low')
        .catch(() => fetchGalleryJson<ImageRecord[]>('/generated/image-index.json', 'low'))
        .then((loadedImages) => {
          if (!cancelled) {
            setImages(loadedImages)
            setFullIndexLoaded(true)
          }
        })
        .catch(console.error)
    }

    const scheduleAfterFirstPaint = () => {
      if (window.location.search) {
        timeoutHandle = window.setTimeout(loadFullIndex, 0)
        return
      }
      const requestIdle = window.requestIdleCallback
      if (typeof requestIdle === 'function') {
        idleHandle = requestIdle(loadFullIndex, { timeout: 1200 })
        return
      }
      timeoutHandle = window.setTimeout(loadFullIndex, 250)
    }

    const frameHandle = window.requestAnimationFrame(scheduleAfterFirstPaint)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameHandle)
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle as number)
      const cancelIdle = window.cancelIdleCallback
      if (idleHandle !== undefined && typeof cancelIdle === 'function') cancelIdle(idleHandle)
    }
  }, [initialImages, initialDataLoading])

  useEffect(() => {
    const updateColumns = () => setColumns(columnsForGalleryWidth(window.innerWidth))
    updateColumns()
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [])

  const filters = useMemo(() => ({ query, selectedYear, theme, speciesFilter, season, peoplePlantsOnly, sortNewest }), [query, selectedYear, theme, season, peoplePlantsOnly, sortNewest])
  const filtered = useMemo(() => filterGalleryImages(images, filters, speciesByImage), [images, filters, speciesByImage])
  const highPriorityThumbnailIds = useMemo(() => new Set(filtered.slice(0, Math.max(columns, MIN_HIGH_PRIORITY_THUMBNAILS)).map((image) => image.id)), [filtered, columns])
  const eagerThumbnailIds = useMemo(() => new Set(filtered.slice(0, Math.max(columns * 2, MIN_EAGER_THUMBNAILS)).map((image) => image.id)), [filtered, columns])
  const visibleThemes = useMemo(() => visibleGalleryThemes(filtered, groups), [filtered, groups])
  const galleryRows = useMemo<GalleryVirtualRow<ImageRecord>[]>(() => buildGalleryRows(filtered, columns), [filtered, columns])
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

  useEffect(() => {
    if (initialDataLoading || !fullIndexLoaded || returnScrollAppliedRef.current) return undefined
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
  }, [initialDataLoading, fullIndexLoaded, galleryRows])

  useEffect(() => {
    const firstVirtualItem = virtualItems[0]
    const year = firstVirtualItem ? galleryRows[firstVirtualItem.index]?.year : galleryRows.find((row) => row.type === 'year')?.year
    if (year) setActiveYear(year)
  }, [virtualItems, galleryRows])

  useEffect(() => {
    const applyUrlState = () => {
      const state = imageGalleryStateFromUrl(window.location.search)
      if (state.viewerId) {
        window.location.replace(galleryViewerPageUrl(state, window.location.hash))
        return true
      }
      setQuery(state.query)
      setTheme(state.theme)
      setSelectedYear(state.selectedYear)
      setSeason(state.season)
      setPeoplePlantsOnly(state.peoplePlantsOnly)
      setSortNewest(state.sortNewest)
      return false
    }
    const redirected = applyUrlState()
    urlStateAppliedRef.current = !redirected
    window.addEventListener('popstate', applyUrlState)
    return () => window.removeEventListener('popstate', applyUrlState)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !urlStateAppliedRef.current) return
    const nextUrl = galleryUrlFromState(window.location.pathname, { ...filters, viewerId: null }, window.location.hash)
    writeBrowserPath(nextUrl, 'replace')
  }, [filters])

  function jumpToYear(year: string) {
    if (selectedYear && selectedYear !== year) setSelectedYear('')
    setActiveYear(year)
    const index = galleryRows.findIndex((row) => row.year === year)
    if (index >= 0) galleryVirtualizer.scrollToIndex(index, { align: 'start', behavior: 'smooth' })
    else {
      setSelectedYear(year)
      galleryFeedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function viewerHref(imageId: string) {
    return galleryViewerPageUrl({ ...filters, viewerId: imageId })
  }

  function rememberGalleryReturnPoint() {
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
  }

  const hasActiveFilters = Boolean(query.trim() || theme !== 'all' || selectedYear || season !== 'all' || peoplePlantsOnly || !sortNewest)
  const supplementalLoader = useGracefulLoader(speciesTagsLoading)

  function resetFilters() {
    setQuery('')
    setTheme('all')
    setSelectedYear('')
    setSeason('all')
    setPeoplePlantsOnly(false)
    setSortNewest(true)
  }

  return (
    <section className="relative z-10 bg-eggshell pb-20 text-midnight-navy">
      {supplementalLoader.shouldRender && (
        <div className={`site-loader site-loader--controlled${supplementalLoader.isVisible ? ' site-loader--visible' : ''}`} role="status" aria-live="polite" aria-label="Beeldarchief laden">
          <div className="site-loader__mark" aria-hidden="true"></div>
          <div className="site-loader__text">
            <span>Daniel Willaeys</span>
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
          onClear={() => { setSelectedYear('') }}
          clearLabel="Alle"
          footer={<button className="inline-flex min-h-8 items-center gap-2 text-sm text-gravel hover:text-obsidian" type="button" onClick={() => { setSelectedYear(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Naar heden <Calendar className="size-4" aria-hidden="true" /></button>}
        />

        <main className="min-w-0 overflow-visible">
          <header className="grid gap-6 border-b border-chalk pb-7 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="eyebrow mb-3">Beeldarchief</p>
              <h1 className="display-title max-w-3xl break-words max-md:text-[42px]">Beeldarchief</h1>
              <p className="m-0 mt-3 max-w-2xl text-sm leading-6 text-gravel">
                {filtered.length.toLocaleString('nl-BE')} foto’s · {visibleThemes.find((item) => item.id === 'mensen')?.count ?? 0} met personen · {visibleThemes.filter((item) => ['appels','peren','pruimen','bessen','bloesem','tuin'].includes(item.id)).reduce((sum, item) => sum + item.count, 0).toLocaleString('nl-BE')} met planten
              </p>
            </div>
            <label className="flex items-center gap-2 self-end text-sm text-gravel">
              Sorteer
              <select className="min-h-9 rounded-full border border-chalk bg-transparent px-3 text-sm text-obsidian outline-none" value={sortNewest ? 'new' : 'old'} onChange={(event) => setSortNewest(event.target.value === 'new')}><option value="new">Nieuw → Oud</option><option value="old">Oud → Nieuw</option></select>
            </label>
          </header>

          <section className="border-b border-chalk py-5" aria-label="Beeldarchief filters">
            <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1.5fr)_repeat(2,minmax(10rem,1fr))_2.5rem]">
              <label className="flex min-h-10 min-w-0 items-center gap-2 border-b border-chalk px-0 lg:border-b-0 lg:border-r lg:pr-4">
                <Search className="size-4 shrink-0 text-gravel" aria-hidden="true" />
                <Input className="h-10 border-0 bg-transparent px-0 text-sm shadow-none outline-none placeholder:text-gravel/70 focus-visible:ring-0" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek plaats, persoon, onderwerp…" />
              </label>
              <Select value={theme} onValueChange={setTheme}><SelectTrigger className="h-10 rounded-none border-b border-chalk px-0 lg:border-b-0 lg:border-r lg:px-3"><SelectValue placeholder="Thema" /></SelectTrigger><SelectContent><SelectItem value="all">Alle thema’s</SelectItem>{groups.themes.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>
              <Select value={season} onValueChange={setSeason}><SelectTrigger className="h-10 rounded-none border-b border-chalk px-0 lg:border-b-0 lg:px-3"><SelectValue placeholder="Seizoen" /></SelectTrigger><SelectContent><SelectItem value="all">Alle seizoenen</SelectItem><SelectItem value="lente">Voorjaar</SelectItem><SelectItem value="zomer">Zomer</SelectItem><SelectItem value="herfst">Herfst</SelectItem><SelectItem value="winter">Winter</SelectItem></SelectContent></Select>
              {hasActiveFilters && <button className="inline-grid size-10 place-items-center rounded-full text-gravel hover:bg-powder hover:text-obsidian" type="button" onClick={resetFilters} aria-label="Filters resetten" title="Filters resetten"><RotateCcw className="size-4" aria-hidden="true" /></button>}
            </div>
          </section>

          <section ref={galleryFeedRef} className="scroll-mt-24 pt-6">
            <div className="relative" style={{ height: `${galleryVirtualizer.getTotalSize()}px` }}>
              {virtualItems.map((virtualItem) => {
                const row = galleryRows[virtualItem.index]
                if (!row) return null
                return (
                  <div
                    className="absolute left-0 top-0 w-full"
                    data-index={virtualItem.index}
                    data-year={row.year}
                    key={virtualItem.key}
                    style={{ height: virtualItem.size, transform: `translateY(${virtualItem.start - galleryVirtualizer.options.scrollMargin}px)` }}
                  >
                    {row.type === 'year' && (
                      <header className="flex h-full scroll-mt-24 items-end justify-between border-b border-chalk pb-5" id={`gallery-year-${row.year}`}>
                        <p className="m-0 text-sm text-gravel">{groups.years.find((item) => item.id === row.year)?.count.toLocaleString('nl-BE')} foto’s</p>
                        <h2 className="m-0 font-heading text-4xl font-normal leading-none tracking-[-0.04em] text-obsidian md:text-5xl">{row.year === 'unknown' ? 'Geen datum' : row.year}</h2>
                      </header>
                    )}
                    {row.type === 'month' && (
                      <header className="flex h-full items-center justify-between border-b border-chalk">
                        <h3 className="m-0 font-heading text-xl font-normal text-obsidian md:text-2xl">{row.label}</h3>
                        <p className="m-0 font-mono text-xs text-gravel">{row.count} foto’s</p>
                      </header>
                    )}
                    {row.type === 'images' && (
                      <div className="flex h-full flex-wrap justify-center gap-2 border-b border-chalk py-2">
                        {row.images.map((image) => {
                          const highPriority = highPriorityThumbnailIds.has(image.id)
                          const eager = highPriority || eagerThumbnailIds.has(image.id)
                          return (
                            <a className="group relative block h-full flex-none overflow-hidden bg-powder text-left" style={{ width: `calc((100% - ${(columns - 1) * 0.5}rem) / ${columns})` }} key={image.id} href={viewerHref(image.id)} onClick={rememberGalleryReturnPoint} title={image.postTitle}>
                              <GalleryThumbnail className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" image={image} loading={eager ? 'eager' : 'lazy'} fetchPriority={highPriority ? 'high' : eager ? 'auto' : 'low'} decoding="async" />
                            </a>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </main>
      </div>
    </section>
  )
}
