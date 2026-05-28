import type { PostSummary } from '../lib/postIndex'
import { formatArchiveDate } from '../lib/date'
import { archiveAssetUrl } from '../lib/assetUrls'

type Props = { post: PostSummary; featured?: boolean }

const countPill = 'inline-flex min-h-6 items-center gap-1 rounded-full bg-pure-surface px-2 font-mono text-xs text-midnight-navy shadow-soft'

export default function PostCard({ post, featured = false }: Props) {
  const image = post.images[0]
  return (
    <article className={featured ? 'grid gap-5 rounded-2xl bg-pure-surface p-5 shadow-soft md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]' : 'grid gap-5 border-t border-rule py-5 md:grid-cols-[10rem_minmax(0,1fr)]'}>
      {image && (
        <a className="block overflow-hidden rounded-2xl bg-ghost-canvas" href={`/posts/${post.slug}/`} aria-label={`Lees ${post.title}`}>
          <img className="aspect-square h-full w-full object-cover transition-transform hover:scale-105" src={archiveAssetUrl(image)} alt="" loading="lazy" decoding="async" />
        </a>
      )}
      <div className="self-center">
        <p className="mb-2 flex flex-wrap items-center gap-2 text-xs leading-none tracking-tight text-slate-ink">
          <span>{formatArchiveDate(post)}</span>
          <span className="inline-flex gap-1" aria-label={`${post.imageCount} beelden, ${post.reactionCount} reacties${post.seriesPostCount ? `, ${post.seriesPostCount} delen` : ''}`}>
            {post.seriesPostCount && <span className={countPill} title="Reeks">{post.seriesPostCount} delen</span>}
            <span className={countPill} title="Beelden">{post.imageCount} beelden</span>
            <span className={countPill} title="Reacties">{post.reactionCount} reacties</span>
          </span>
        </p>
        <h3 className="m-0 font-heading text-3xl font-normal leading-tight tracking-tight text-midnight-navy md:text-5xl"><a className="no-underline" href={`/posts/${post.slug}/`}>{post.title}</a></h3>
        {post.excerpt && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-ink">{post.excerpt}</p>}
      </div>
    </article>
  )
}
