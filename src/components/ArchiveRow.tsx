import { ImageIcon, Layers2, MessageCircle } from 'lucide-react'
import type { PostSummary } from '../lib/postIndex'
import { formatArchiveDate } from '../lib/date'

type Props = { post: PostSummary; index: number; total?: number }

const archiveRow = 'group relative grid min-h-[4.75rem] grid-cols-[6ch_12rem_minmax(0,1fr)_13rem] items-baseline gap-4 rounded-xl border border-transparent px-4 py-3 text-inherit no-underline outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out before:absolute before:inset-y-3 before:left-0 before:w-px before:rounded-full before:bg-transparent before:transition-colors hover:border-chalk/80 hover:bg-pure-surface/75 hover:shadow-subtle hover:before:bg-obsidian/25 focus-visible:border-obsidian/30 focus-visible:shadow-blue focus-visible:before:bg-obsidian max-md:grid-cols-1'
const metaText = 'font-mono text-xs text-gravel transition-colors group-hover:text-cinder'
const countPill = 'inline-flex min-h-6 items-center gap-1.5 rounded-md border border-chalk/70 bg-powder/50 px-2 font-mono text-[11px] leading-none text-gravel transition-colors group-hover:border-chalk group-hover:bg-pure-surface group-hover:text-obsidian'
const countIcon = 'size-3.5 text-fog transition-colors group-hover:text-gravel'

export default function ArchiveRow({ post, index, total }: Props) {
  const displayIndex = total ? total - index : index + 1

  return (
    <a className={archiveRow} href={`/posts/${post.slug}/`}>
      <span className={metaText}>{String(displayIndex).padStart(4, '0')}</span>
      <span className={metaText}>{formatArchiveDate(post)}</span>
      <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-base font-medium text-obsidian transition-colors max-md:whitespace-normal">{post.title}</strong>
      <span className="inline-flex justify-end gap-1 text-right max-md:justify-start" aria-label={`${post.imageCount} beelden, ${post.reactionCount} reacties${post.seriesPostCount ? `, ${post.seriesPostCount} delen` : ''}`}>
        {post.seriesPostCount && <span className={countPill} title="Reeks" aria-label={`${post.seriesPostCount} delen`}><Layers2 className={countIcon} aria-hidden="true" />{post.seriesPostCount}</span>}
        <span className={countPill} title="Beelden" aria-label={`${post.imageCount} beelden`}><ImageIcon className={countIcon} aria-hidden="true" />{post.imageCount}</span>
        <span className={countPill} title="Reacties" aria-label={`${post.reactionCount} reacties`}><MessageCircle className={countIcon} aria-hidden="true" />{post.reactionCount}</span>
      </span>
    </a>
  )
}
