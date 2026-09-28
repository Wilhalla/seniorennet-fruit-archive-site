import { useEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { ImageIcon, Layers2, MessageCircle } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ACTIVE_YEAR_VIEWPORT_OFFSET, activeYearFromVirtualItems } from '../lib/activeVirtualYear'
import { archiveYear, buildArchiveChronology, displayArchiveYear, formatArchiveDate } from '../lib/archiveDateTime'
import { activeArchiveTopicFromSearch, archiveTopicFilterLabel, filterArchivePostsByTopic } from '../lib/archiveTopicFilter'
import { fetchJson, isAbortError } from '../lib/clientFetch'
import { useDismissHydrationLoader } from './gallery/useGracefulLoader'
import ArchiveViewToggle, { type ArchiveViewMode } from './ArchiveViewToggle'
import { yearPickerCountClass, yearPickerItemClass } from './yearPickerStyles'

type ArchivePost = {
  id: string
  slug: string
  title: string
  date: string
  isoDate: string
  imageCount: number
  reactionCount: number
  topicIds?: string[]
  isSeries?: boolean
  seriesPostCount?: number
}

type ArchiveTopic = {
  id: string
  label?: string
  generatedLabel?: string
  postCount?: number
}

type ArchivePayload = {
  aggregated: ArchivePost[]
  all: ArchivePost[]
  topics?: ArchiveTopic[]
}

const emptyPayload: ArchivePayload = { aggregated: [], all: [] }
const archiveRow = 'group relative grid min-h-[4.75rem] grid-cols-[6ch_12rem_minmax(0,1fr)_13rem] items-center gap-4 rounded-xl border border-transparent px-4 py-3 text-inherit no-underline outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out before:absolute before:inset-y-3 before:left-0 before:w-px before:rounded-full before:bg-transparent before:transition-colors hover:border-chalk/80 hover:bg-pure-surface/75 hover:shadow-subtle hover:before:bg-obsidian/25 focus-visible:border-obsidian/30 focus-visible:shadow-blue focus-visible:before:bg-obsidian max-md:min-h-[10rem] max-md:grid-cols-1 max-md:items-start max-md:gap-2 max-md:px-0 max-md:py-4'
const metaText = 'font-mono text-xs text-gravel transition-colors group-hover:text-cinder'
const countPill = 'inline-flex min-h-6 items-center gap-1.5 rounded-md border border-chalk/70 bg-powder/50 px-2 font-mono text-[11px] leading-none text-gravel transition-colors group-hover:border-chalk group-hover:bg-pure-surface group-hover:text-obsidian'
const countIcon = 'size-3.5 text-fog transition-colors group-hover:text-gravel'

function fetchArchive(signal?: AbortSignal): Promise<ArchivePayload> {
  return fetchJson<ArchivePayload>('/generated/archive-posts.client.json', { signal })
}

function useArchivePayload() {
  const [payload, setPayload] = useState<ArchivePayload>(emptyPayload)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    fetchArchive(controller.signal)
      .then(setPayload)
      .catch((error) => {
        if (!isAbortError(error)) console.error(error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  return { payload, loading }
}

export default function ArchiveVirtualList() {
  const { payload, loading } = useArchivePayload()
  const [mode, setMode] = useState<ArchiveViewMode>('aggregated')
  const [activeYear, setActiveYear] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const listRef = useRef<HTMLElement | null>(null)

  useDismissHydrationLoader('archive-hydration-loader', loading)

  const unfilteredPosts = mode === 'aggregated' ? payload.aggregated : payload.all
  const posts = useMemo(() => filterArchivePostsByTopic(unfilteredPosts, topicFilter), [unfilteredPosts, topicFilter])
  const activeTopic = useMemo(() => payload.topics?.find((topic) => topic.id === topicFilter), [payload.topics, topicFilter])
  const activeTopicLabel = topicFilter ? archiveTopicFilterLabel(activeTopic, topicFilter) : ''

  const yearGroups = useMemo(() => buildArchiveChronology(posts, { sort: false }).yearGroups, [posts])

  useEffect(() => {
    const sync = () => setTopicFilter(activeArchiveTopicFromSearch(window.location.search))
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  function changeCategory(categoryId: string) {
    const next = categoryId === 'all' ? '' : categoryId
    setTopicFilter(next)
    const url = new URL(window.location.href)
    url.searchParams.delete('topic')
    if (next) url.searchParams.set('category', next)
    else url.searchParams.delete('category')
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
    setActiveYear('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const virtualizer = useWindowVirtualizer({
    count: posts.length,
    estimateSize: () => (typeof window !== 'undefined' && window.innerWidth < 768 ? 176 : 82),
    overscan: 14,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    getItemKey: (index) => posts[index]?.id ?? index,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [mode, posts.length, topicFilter, virtualizer])

  const virtualItems = virtualizer.getVirtualItems()
  const displayedActiveYear = yearGroups.some((group) => group.year === activeYear) ? activeYear : yearGroups[0]?.year || ''

  useEffect(() => {
    const viewportTop = typeof window === 'undefined' ? 0 : window.scrollY + ACTIVE_YEAR_VIEWPORT_OFFSET
    const year = activeYearFromVirtualItems(posts, virtualItems, archiveYear, viewportTop)
    if (year) setActiveYear(year)
  }, [virtualItems, posts])

  function changeMode(nextMode: ArchiveViewMode) {
    setMode(nextMode)
    setActiveYear('')
  }

  function jumpToYear(year: string) {
    const group = yearGroups.find((item) => item.year === year)
    if (!group) return
    setActiveYear(year)
    virtualizer.scrollToIndex(group.firstIndex, { align: 'start', behavior: 'smooth' })
  }

  return (
    <>
      <section className="site-shell flex flex-wrap items-center justify-between gap-4 border-b border-rule py-6" aria-label="Archiefweergave">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <label className="text-sm text-gravel" htmlFor="archive-category">Categorie</label>
          <Select value={topicFilter || 'all'} onValueChange={changeCategory}>
            <SelectTrigger id="archive-category" className="min-w-48 rounded-none border-0 border-b border-chalk bg-transparent px-0 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle categorieën</SelectItem>
              {payload.topics?.map((topic) => <SelectItem key={topic.id} value={topic.id}>{archiveTopicFilterLabel(topic, topic.id)}</SelectItem>)}
            </SelectContent>
          </Select>
          {topicFilter && <span className="text-sm text-gravel">{posts.length.toLocaleString('nl-BE')} verhalen in {activeTopicLabel}</span>}
        </div>
        <ArchiveViewToggle
          mode={mode}
          aggregatedCount={topicFilter ? filterArchivePostsByTopic(payload.aggregated, topicFilter).length : payload.aggregated.length}
          allCount={topicFilter ? filterArchivePostsByTopic(payload.all, topicFilter).length : payload.all.length}
          onChange={changeMode}
        />
      </section>

      <section className="site-shell grid grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-4 pb-56 pt-6 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
        <aside className="sticky top-16 self-start border-r border-chalk/80 pr-2 md:top-20 md:border-r-0 md:pr-0" aria-label="Archiefjaren">
          {loading && <div className="text-sm text-slate-ink max-md:sr-only">Laden…</div>}
          <nav className={`${loading ? 'mt-4 ' : ''}grid max-h-[calc(100svh-4rem)] gap-1 overflow-auto md:max-h-[calc(100vh-5rem)] md:gap-2`} aria-label="Spring naar jaar">
            {yearGroups.map((group) => {
              const isActive = group.year === displayedActiveYear
              return (
                <button
                  className={yearPickerItemClass}
                  data-active={isActive ? 'true' : 'false'}
                  key={group.year}
                  type="button"
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => jumpToYear(group.year)}
                >
                  <span>{displayArchiveYear(group.year)}</span>
                  <span className={yearPickerCountClass}>{group.count}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <section ref={listRef} className="min-w-0 scroll-mt-24" aria-label="Alle blogberichten">
          {!loading && topicFilter && posts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-chalk bg-powder/40 p-8 text-slate-ink">
              Geen berichten gevonden in categorie <strong className="text-obsidian">{activeTopicLabel}</strong>. <button className="font-bold text-obsidian underline decoration-chalk underline-offset-4 hover:decoration-obsidian" type="button" onClick={() => changeCategory('all')}>Toon alle berichten</button>.
            </div>
          )}
          {loading ? (
            <div className="grid gap-2">
              {Array.from({ length: 18 }).map((_, index) => <div className="h-20 animate-pulse rounded-2xl bg-pure-surface" key={index} />)}
            </div>
          ) : (
            <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualItems.map((virtualItem) => {
                const post = posts[virtualItem.index]
                if (!post) return null
                return (
                  <div
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    data-index={virtualItem.index}
                    key={virtualItem.key}
                    style={{ transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)` }}
                  >
                    <a className={archiveRow} href={`/posts/${post.slug}/`}>
                      <span className={`${metaText} max-md:hidden`}>{String(virtualItem.index + 1).padStart(4, '0')}</span>
                      <span className={metaText}>{formatArchiveDate(post)}</span>
                      <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-medium text-obsidian transition-colors max-md:whitespace-normal max-md:text-xl max-md:leading-snug">{post.title}</strong>
                      <span className="inline-flex flex-wrap justify-end gap-1 text-right max-md:justify-start" aria-label={`${post.imageCount} beelden, ${post.reactionCount} reacties${post.seriesPostCount ? `, ${post.seriesPostCount} delen` : ''}`}>
                        {post.seriesPostCount && <span className={countPill} title="Reeks" aria-label={`${post.seriesPostCount} delen`}><Layers2 className={countIcon} aria-hidden="true" />{post.seriesPostCount}</span>}
                        <span className={countPill} title="Beelden" aria-label={`${post.imageCount} beelden`}><ImageIcon className={countIcon} aria-hidden="true" />{post.imageCount}</span>
                        <span className={countPill} title="Reacties" aria-label={`${post.reactionCount} reacties`}><MessageCircle className={countIcon} aria-hidden="true" />{post.reactionCount}</span>
                      </span>
                    </a>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </section>
    </>
  )
}
