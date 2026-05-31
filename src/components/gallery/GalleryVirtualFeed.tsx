import type { Key, RefObject } from 'react'
import GalleryThumbnail from './GalleryThumbnail'
import type { GalleryGroups, GalleryImageRecord as ImageRecord, GalleryVirtualRow } from '../../lib/imageGallerySession'

type VirtualItemLike = {
  index: number
  key: Key
  size: number
  start: number
}

type Props = {
  columns: number
  eagerThumbnailIds: Set<string>
  feedRef: RefObject<HTMLElement | null>
  groups: GalleryGroups
  highPriorityThumbnailIds: Set<string>
  rows: GalleryVirtualRow<ImageRecord>[]
  scrollMargin: number
  totalSize: number
  virtualItems: VirtualItemLike[]
  viewerHref: (imageId: string) => string
  onRememberReturnPoint: () => void
}

export default function GalleryVirtualFeed({
  columns,
  eagerThumbnailIds,
  feedRef,
  groups,
  highPriorityThumbnailIds,
  rows,
  scrollMargin,
  totalSize,
  virtualItems,
  viewerHref,
  onRememberReturnPoint,
}: Props) {
  return (
    <section ref={feedRef} className="scroll-mt-24 pt-3">
      <div className="relative" style={{ height: `${totalSize}px` }}>
        {virtualItems.map((virtualItem) => {
          const row = rows[virtualItem.index]
          if (!row) return null

          return (
            <div
              className="absolute left-0 top-0 w-full"
              data-index={virtualItem.index}
              data-year={row.year}
              key={virtualItem.key}
              style={{ height: virtualItem.size, transform: `translateY(${virtualItem.start - scrollMargin}px)` }}
            >
              <GalleryVirtualRowView
                columns={columns}
                eagerThumbnailIds={eagerThumbnailIds}
                groups={groups}
                highPriorityThumbnailIds={highPriorityThumbnailIds}
                row={row}
                viewerHref={viewerHref}
                onRememberReturnPoint={onRememberReturnPoint}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

type RowProps = Pick<Props, 'columns' | 'eagerThumbnailIds' | 'groups' | 'highPriorityThumbnailIds' | 'viewerHref' | 'onRememberReturnPoint'> & {
  row: GalleryVirtualRow<ImageRecord>
}

function GalleryVirtualRowView({ columns, eagerThumbnailIds, groups, highPriorityThumbnailIds, row, viewerHref, onRememberReturnPoint }: RowProps) {
  if (row.type === 'year') {
    return (
      <header className="flex h-full scroll-mt-24 items-end justify-between border-b border-chalk pb-5" id={`gallery-year-${row.year}`}>
        <p className="m-0 text-sm text-gravel">{groups.years.find((item) => item.id === row.year)?.count.toLocaleString('nl-BE')} foto’s</p>
        <h2 className="m-0 font-heading text-4xl font-normal leading-none tracking-[-0.04em] text-obsidian md:text-5xl">{row.year === 'unknown' ? 'Geen datum' : row.year}</h2>
      </header>
    )
  }

  if (row.type === 'month') {
    return (
      <header className="flex h-full items-center justify-between border-b border-chalk">
        <h3 className="m-0 font-heading text-xl font-normal text-obsidian md:text-2xl">{row.label}</h3>
        <p className="m-0 font-mono text-xs text-gravel">{row.count} foto’s</p>
      </header>
    )
  }

  return (
    <div className="flex h-full flex-wrap justify-start gap-2 border-b border-chalk py-2">
      {row.images.map((image) => {
        const highPriority = highPriorityThumbnailIds.has(image.id)
        const eager = highPriority || eagerThumbnailIds.has(image.id)
        return (
          <a className="group relative block h-full flex-none overflow-hidden bg-powder text-left" style={{ width: `calc((100% - ${(columns - 1) * 0.5}rem) / ${columns})` }} key={image.id} href={viewerHref(image.id)} onClick={onRememberReturnPoint} title={image.postTitle}>
            <GalleryThumbnail className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" image={image} loading={eager ? 'eager' : 'lazy'} fetchPriority={highPriority ? 'high' : eager ? 'auto' : 'low'} decoding="async" />
          </a>
        )
      })}
    </div>
  )
}
