import { ImageIcon, MessageCircle } from 'lucide-react'
import relatedPostsData from '../data/generated/related-posts.json'
import mapPointsData from '../data/generated/map-points.json'
import topicsData from '../data/generated/topics.json'
import { archiveSmallThumbUrl } from '../lib/assetUrls'
import { postIndex, formatDate, type PostSummary } from '../lib/postIndex'

type Props = { postId: string }
type MapPoint = { id: string; topicId: string; x: number; y: number }
type Topic = { id: string; label: string; generatedLabel: string }

const countPill = 'inline-flex min-h-6 items-center gap-1 rounded-full bg-pure-surface px-2 font-mono text-xs text-midnight-navy shadow-soft'

export default function RelatedPosts({ postId }: Props) {
  const relatedPosts = relatedPostsData as Record<string, string[]>
  const mapPoints = mapPointsData as MapPoint[]
  const topics = topicsData as Topic[]
  const postsById = new Map<string, PostSummary>(postIndex.map((post) => [post.id, post]))
  const point = mapPoints.find((item) => item.id === postId)
  const topic = point ? topics.find((item) => item.id === point.topicId) : undefined
  const topicLabel = topic ? (topic.label && topic.label !== 'Nog te benoemen' ? topic.label : topic.generatedLabel) : 'Nog te plaatsen in de atlas'
  const related = (relatedPosts[postId] ?? []).map((id) => postsById.get(id)).filter(Boolean).slice(0, 6) as PostSummary[]

  if (!point && related.length === 0) return null

  return (
    <section className="site-shell border-t border-rule py-14" aria-labelledby="related-atlas-title">
      <div className="relative">
        <img className="apple-image absolute right-0 top-0 hidden w-20 -rotate-6 opacity-80 md:block" src="/apple-assets/apple-1-160.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" />
        <p className="eyebrow">Verder lezen</p>
        <h2 id="related-atlas-title" className="section-title">Nabije berichten</h2>
        <p className="section-kicker">Thema: <strong>{topicLabel}</strong>.</p>
      </div>

      {related.length > 0 && (
        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {related.map((post) => {
            const image = post.images[0]
            const thumbnailSrc = image ? archiveSmallThumbUrl(image) : '/apple-assets/apple-1-160.webp'
            const thumbnailClass = image
              ? 'h-36 w-full object-cover transition-transform duration-300 group-hover:scale-105'
              : 'h-36 w-full object-contain p-8 opacity-75 transition-transform duration-300 group-hover:scale-105'

            return (
              <article className="overflow-hidden rounded-2xl bg-pure-surface shadow-soft" key={post.id}>
                <a className="group block bg-ghost-canvas no-underline" href={`/posts/${post.slug}/`} aria-label={`Lees ${post.title}`}>
                  <img className={thumbnailClass} src={thumbnailSrc} alt="" loading="lazy" decoding="async" />
                </a>
                <div className="p-5">
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-xs leading-none tracking-tight text-slate-ink">
                    <span>{formatDate(post)}</span>
                    <span className="inline-flex gap-1" aria-label={`${post.imageCount} beelden, ${post.reactionCount} reacties`}>
                      <span className={countPill} title="Beelden"><ImageIcon className="size-3.5 text-slate-ink" aria-hidden="true" />{post.imageCount}</span>
                      <span className={countPill} title="Reacties"><MessageCircle className="size-3.5 text-slate-ink" aria-hidden="true" />{post.reactionCount}</span>
                    </span>
                  </p>
                  <h3 className="font-heading text-3xl font-normal leading-tight tracking-tight"><a className="no-underline" href={`/posts/${post.slug}/`}>{post.title}</a></h3>
                  {post.excerpt && <p className="mt-3 text-sm leading-relaxed text-slate-ink">{post.excerpt}</p>}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
