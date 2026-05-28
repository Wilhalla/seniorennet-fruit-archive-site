import { useEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { ImageIcon, Layers2, MessageCircle } from 'lucide-react'
import { archiveYear, displayArchiveYear, formatArchiveDate } from '../lib/archiveDateTime'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

type ArchivePost = {
  id: string
  slug: string
  title: string
  date: string
  isoDate: string
  imageCount: number
  reactionCount: number
  isSeries?: boolean
  seriesPostCount?: number
}

type ArchivePayload = {
  aggregated: ArchivePost[]
  all: ArchivePost[]
}

type Mode = 'aggregated' | 'all'

const emptyPayload: ArchivePayload = { aggregated: [], all: [] }
const archiveRow = 'group relative grid min-h-[4.75rem] grid-cols-[6ch_12rem_minmax(0,1fr)_13rem] items-center gap-4 rounded-xl border border-transparent px-4 py-3 text-inherit no-underline outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out before:absolute before:inset-y-3 before:left-0 before:w-px before:rounded-full before:bg-transparent before:transition-colors hover:border-chalk/80 hover:bg-pure-surface/75 hover:shadow-subtle hover:before:bg-obsidian/25 focus-visible:border-obsidian/30 focus-visible:shadow-blue focus-visible:before:bg-obsidian max-md:min-h-[10rem] max-md:grid-cols-1 max-md:items-start max-md:gap-2 max-md:px-0 max-md:py-4'
const metaText = 'font-mono text-xs text-gravel transition-colors group-hover:text-cinder'
const countPill = 'inline-flex min-h-6 items-center gap-1.5 rounded-md border border-chalk/70 bg-powder/50 px-2 font-mono text-[11px] leading-none text-gravel transition-colors group-hover:border-chalk group-hover:bg-pure-surface group-hover:text-obsidian'
const countIcon = 'size-3.5 text-fog transition-colors group-hover:text-gravel'
const aggregatedTooltip = 'Bundelt vervolg-, aanvulling- en deelberichten tot één reeks, zodat lange verhalen als één bericht verschijnen.'
const allPostsTooltip = 'Toont elk oorspronkelijk geïmporteerd blogbericht apart, ook vervolg-, aanvulling- en deelberichten.'

async function fetchArchive(): Promise<ArchivePayload> {
  const response = await fetch('/generated/archive-posts.client.json')
  if (!response.ok) throw new Error(`Failed to load archive index: ${response.status}`)
  return response.json()
}

export default function ArchiveVirtualList() {
  const [payload, setPayload] = useState<ArchivePayload>(emptyPayload)
  const [mode, setMode] = useState<Mode>('aggregated')
  const [loading, setLoading] = useState(true)
  const [activeYear, setActiveYear] = useState('')
  const listRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    fetchArchive()
      .then((data) => {
        setPayload(data)
        setActiveYear(archiveYear(data.aggregated[0] ?? data.all[0] ?? { isoDate: '' } as ArchivePost))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const posts = mode === 'aggregated' ? payload.aggregated : payload.all

  const yearGroups = useMemo(() => {
    const groups: Array<{ year: string; count: number; firstIndex: number }> = []
    const seen = new Map<string, number>()
    posts.forEach((post, index) => {
      const year = archiveYear(post)
      const groupIndex = seen.get(year)
      if (groupIndex === undefined) {
        seen.set(year, groups.length)
        groups.push({ year, count: 1, firstIndex: index })
      } else groups[groupIndex]!.count += 1
    })
    return groups
  }, [posts])

  const virtualizer = useWindowVirtualizer({
    count: posts.length,
    estimateSize: () => (typeof window !== 'undefined' && window.innerWidth < 768 ? 176 : 82),
    overscan: 14,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    getItemKey: (index) => posts[index]?.id ?? index,
  })

  useEffect(() => {
    virtualizer.measure()
    setActiveYear(yearGroups[0]?.year ?? '')
  }, [mode, posts.length, yearGroups, virtualizer])

  const virtualItems = virtualizer.getVirtualItems()

  useEffect(() => {
    const first = virtualItems[0]
    const post = first ? posts[first.index] : posts[0]
    if (post) setActiveYear(archiveYear(post))
  }, [virtualItems, posts])

  function jumpToYear(year: string) {
    const group = yearGroups.find((item) => item.year === year)
    if (!group) return
    setActiveYear(year)
    virtualizer.scrollToIndex(group.firstIndex, { align: 'start', behavior: 'smooth' })
  }

  return (
    <>
      <section className="site-shell flex justify-end border-b border-rule py-6" aria-label="Archiefweergave">
        <TooltipProvider>
          <div className="inline-flex rounded-full bg-pure-surface p-1 shadow-soft" role="group" aria-label="Kies archiefweergave">
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className={`rounded-full px-4 py-2 text-sm transition ${mode === 'aggregated' ? 'bg-obsidian text-eggshell' : 'text-slate-ink hover:bg-powder hover:text-obsidian'}`} onClick={() => setMode('aggregated')}>
                  Samengevoegd <span className="font-mono">{payload.aggregated.length.toLocaleString('nl-BE')}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-72 text-center leading-snug">
                {aggregatedTooltip}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className={`rounded-full px-4 py-2 text-sm transition ${mode === 'all' ? 'bg-obsidian text-eggshell' : 'text-slate-ink hover:bg-powder hover:text-obsidian'}`} onClick={() => setMode('all')}>
                  Losse berichten <span className="font-mono">{payload.all.length.toLocaleString('nl-BE')}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-72 text-center leading-snug">
                {allPostsTooltip}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </section>

      <section className="site-shell grid grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-4 pb-56 pt-6 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
        <aside className="sticky top-16 self-start border-r border-chalk/80 pr-2 md:top-20 md:border-r-0 md:pr-0" aria-label="Archiefjaren">
          {loading && <div className="text-sm text-slate-ink max-md:sr-only">Laden…</div>}
          <nav className={`${loading ? 'mt-4 ' : ''}grid max-h-[calc(100svh-4rem)] gap-1 overflow-auto md:max-h-[calc(100vh-5rem)] md:gap-2`} aria-label="Spring naar jaar">
            {yearGroups.map((group) => (
              <button className={group.year === activeYear ? 'flex min-h-8 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-obsidian px-2 text-center text-sm font-bold text-eggshell md:justify-between md:bg-transparent md:px-0 md:text-left md:text-base md:text-obsidian' : 'flex min-h-8 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-2 text-center text-sm text-slate-ink hover:bg-powder hover:text-obsidian md:justify-between md:px-0 md:text-left md:text-base'} key={group.year} type="button" onClick={() => jumpToYear(group.year)}>
                <span>{displayArchiveYear(group.year)}</span>
                <span className="hidden font-mono text-xs md:inline">{group.count}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section ref={listRef} className="min-w-0 scroll-mt-24" aria-label="Alle blogberichten">
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
