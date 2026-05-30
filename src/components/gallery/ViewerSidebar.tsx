import { Calendar, ExternalLink, Images } from 'lucide-react'
import type { Key, RefObject } from 'react'
import GalleryThumbnail from './GalleryThumbnail'
import { formatImagePostDateTime, type GalleryImageRecord as ImageRecord } from '../../lib/imageGallerySession'

type TimelineVirtualizer = {
  getTotalSize: () => number
  getVirtualItems: () => Array<{ index: number; key: Key; size: number; start: number }>
}

type Props = {
  filtered: ImageRecord[]
  relatedLoading: boolean
  similarImages: ImageRecord[]
  timelineRef: RefObject<HTMLDivElement | null>
  timelineVirtualizer: TimelineVirtualizer
  viewerImage: ImageRecord
  viewerIndex: number
  onSelectImage: (imageId: string) => void
}

export default function ViewerSidebar({ filtered, relatedLoading, similarImages, timelineRef, timelineVirtualizer, viewerImage, viewerIndex, onSelectImage }: Props) {
  return (
    <aside className="bg-eggshell lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
      <section className="border-b border-chalk p-4 md:p-5">
        <h1 className="m-0 text-base font-medium leading-snug text-obsidian">{viewerImage.caption || viewerImage.postTitle}</h1>
        <p className="m-0 mt-1 text-xs text-gravel">{formatImagePostDateTime(viewerImage)}</p>
        {viewerImage.excerpt && <p className="m-0 mt-3 text-sm leading-6 text-gravel">{viewerImage.excerpt}</p>}
        <a className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-full border border-obsidian bg-obsidian px-3 text-sm font-medium text-eggshell no-underline hover:text-eggshell" href={`/posts/${viewerImage.postSlug}/`}>
          Lees het artikel bij deze foto <ExternalLink className="size-4" aria-hidden="true" />
        </a>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Beeldtags">
          {viewerImage.visualTags.slice(0, 6).map((tag) => (
            <span className="inline-flex min-h-7 items-center rounded-full border border-chalk px-2.5 text-xs text-obsidian" key={tag}>{tag}</span>
          ))}
          <span className="inline-flex min-h-7 items-center rounded-full border border-chalk px-2.5 font-mono text-xs text-gravel">{viewerImage.season}</span>
          {viewerImage.year && <span className="inline-flex min-h-7 items-center rounded-full border border-chalk px-2.5 font-mono text-xs text-gravel">{viewerImage.year}</span>}
        </div>
      </section>

      <section className="border-b border-chalk p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 inline-flex items-center gap-2 text-sm font-medium text-obsidian"><Calendar className="size-4" aria-hidden="true" /> Tijdlijn</h2>
            <p className="m-0 mt-1 text-xs text-gravel">Scroll door de huidige beeldselectie.</p>
          </div>
          <span className="font-mono text-xs text-gravel">{viewerIndex >= 0 ? `${viewerIndex + 1}/${filtered.length}` : ''}</span>
        </div>
        <div ref={timelineRef} className="h-48 overflow-x-auto border border-chalk" aria-label="Chronologische beeldtijdlijn">
          <div className="relative h-full" style={{ width: `${timelineVirtualizer.getTotalSize()}px` }}>
            {timelineVirtualizer.getVirtualItems().map((virtualItem) => {
              const image = filtered[virtualItem.index]
              if (!image) return null
              const active = image.id === viewerImage.id
              return (
                <button
                  className={active ? 'absolute top-0 h-full border border-obsidian bg-eggshell p-1 text-left' : 'absolute top-0 h-full border-r border-chalk bg-eggshell p-1 text-left hover:bg-powder'}
                  key={virtualItem.key}
                  type="button"
                  onClick={() => onSelectImage(image.id)}
                  aria-current={active ? 'true' : undefined}
                  style={{ width: `${Math.max(1, virtualItem.size - 6)}px`, transform: `translateX(${virtualItem.start}px)` }}
                >
                  <GalleryThumbnail className="aspect-[4/3] w-full object-cover" image={image} alt="" loading="lazy" fetchPriority="low" decoding="async" />
                  <span className="line-clamp-2 pt-1 text-[10px] leading-3 text-obsidian">{image.postTitle}</span>
                  <span className="block truncate pt-0.5 font-mono text-[9px] text-gravel">{formatImagePostDateTime(image)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="m-0 inline-flex items-center gap-2 text-sm font-medium text-obsidian"><Images className="size-4" aria-hidden="true" /> Visueel gerelateerd</h2>
          {relatedLoading && <span className="text-xs text-gravel">laden…</span>}
        </div>
        {similarImages.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {similarImages.map((image) => (
              <button className="group grid gap-2 border border-chalk p-1 text-left hover:border-slate" key={image.id} type="button" onClick={() => onSelectImage(image.id)}>
                <GalleryThumbnail className="aspect-[4/3] w-full object-cover" image={image} alt="" loading="lazy" fetchPriority="low" decoding="async" />
                <span className="px-1 pb-1">
                  <span className="line-clamp-2 text-xs leading-4 text-gravel">{image.postTitle}</span>
                  <span className="mt-1 block truncate font-mono text-[10px] text-gravel/75">{formatImagePostDateTime(image)}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="m-0 text-sm leading-6 text-gravel">Geen gerelateerde beelden gevonden.</p>
        )}
      </section>
    </aside>
  )
}
