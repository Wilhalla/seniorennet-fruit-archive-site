import { ArrowLeft, ArrowRight, ImageIcon, MessageCircle } from 'lucide-react'
import { archiveSmallThumbUrl } from '../lib/assetUrls'
import { aggregatedPostIndex, formatDate, type PostSummary } from '../lib/postIndex'

type Props = { postId: string }
type ChronologicalSuggestion = PostSummary & { relation: 'earlier' | 'later'; label: string }

const countPill = 'inline-flex min-h-6 items-center gap-1 rounded-full bg-pure-surface px-2 font-mono text-xs text-midnight-navy shadow-soft'

function chronologicalSuggestions(postId: string): ChronologicalSuggestion[] {
  const currentIndex = aggregatedPostIndex.findIndex((post) => post.id === postId)
  if (currentIndex < 0) return []

  const earlier = aggregatedPostIndex[currentIndex + 1]
  const later = aggregatedPostIndex.slice(Math.max(0, currentIndex - 2), currentIndex).reverse()

  return [
    ...(earlier ? [{ ...earlier, relation: 'earlier' as const, label: 'Eerder' }] : []),
    ...later.map((post, index) => ({
      ...post,
      relation: 'later' as const,
      label: index === 0 ? 'Later' : 'Nog later',
    })),
  ]
}

export default function ChronologicalPosts({ postId }: Props) {
  const suggestions = chronologicalSuggestions(postId)
  if (suggestions.length === 0) return null

  return (
    <section className="site-shell border-t border-rule py-14" aria-labelledby="chronological-posts-title">
      <div className="flex items-end justify-between gap-6 max-md:flex-col max-md:items-start">
        <div>
          <h2 id="chronological-posts-title" className="section-title">Chronologisch verder</h2>
          <p className="section-kicker">Eén bericht net ervoor, en tot twee berichten net erna in het archief.</p>
        </div>
        <a className="button-link" href="/archive/">Open tijdlijn</a>
      </div>

      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {suggestions.map((post) => {
          const image = post.images[0]
          const thumbnailSrc = image ? archiveSmallThumbUrl(image) : '/apple-assets/apple-1-160.webp'
          const thumbnailClass = image
            ? 'h-32 w-full object-cover transition-transform duration-300 group-hover:scale-105'
            : 'h-32 w-full object-contain p-8 opacity-75 transition-transform duration-300 group-hover:scale-105'
          const Icon = post.relation === 'earlier' ? ArrowLeft : ArrowRight

          return (
            <article className="group overflow-hidden rounded-2xl bg-pure-surface shadow-soft" key={`${post.relation}-${post.id}`}>
              <a className="block bg-ghost-canvas no-underline" href={`/posts/${post.slug}/`} aria-label={`${post.label}: ${post.title}`}>
                <img className={thumbnailClass} src={thumbnailSrc} alt="" loading="lazy" decoding="async" />
              </a>
              <div className="p-5">
                <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-eggshell px-3 py-1 text-xs font-medium text-midnight-navy">
                  <Icon className="size-3.5" aria-hidden="true" />
                  {post.label}
                </p>
                <p className="mb-2 flex flex-wrap items-center gap-2 text-xs leading-none tracking-tight text-slate-ink">
                  <span>{formatDate(post)}</span>
                  <span className="inline-flex gap-1" aria-label={`${post.imageCount} beelden, ${post.reactionCount} reacties`}>
                    <span className={countPill} title="Beelden"><ImageIcon className="size-3.5 text-slate-ink" aria-hidden="true" />{post.imageCount}</span>
                    <span className={countPill} title="Reacties"><MessageCircle className="size-3.5 text-slate-ink" aria-hidden="true" />{post.reactionCount}</span>
                  </span>
                </p>
                <h3 className="font-heading text-3xl font-normal leading-tight tracking-tight"><a className="no-underline" href={`/posts/${post.slug}/`}>{post.title}</a></h3>
                {post.excerpt && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-ink">{post.excerpt}</p>}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
