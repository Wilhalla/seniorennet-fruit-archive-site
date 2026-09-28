import type { PostSummary } from '../lib/postIndex'
import { formatArchiveDate } from '../lib/date'
import { archiveAssetUrl } from '../lib/assetUrls'

type Props = {
  leadPost: PostSummary
  postCount: number
}

export default function Hero({ leadPost, postCount }: Props) {
  const leadImage = leadPost.images[0]

  return (
    <section className="site-shell relative grid min-h-[32rem] items-end gap-14 overflow-hidden py-14 md:grid-cols-[minmax(0,1fr)_minmax(20rem,0.6fr)]">
      <img className="apple-image absolute right-8 top-8 hidden w-28 rotate-6 md:block" src="/apple-assets/apple-2-160.webp" alt="" aria-hidden="true" loading="eager" decoding="async" />
      <div className="grid gap-5">
        <h1 className="display-title">Blogarchief Daniël Willaeys</h1>
        <p className="m-0 max-w-3xl text-lg leading-snug text-slate-ink">{postCount.toLocaleString('nl-BE')} bewaarde berichten met foto’s en reacties.</p>
        <div className="flex flex-wrap items-center gap-3">
          <a className="button-link" href="/archive/">Bekijk alle berichten</a>
          <a className="font-medium text-midnight-navy no-underline" href={`/posts/${leadPost.slug}/`}>Uitgelicht: {leadPost.title}</a>
        </div>
      </div>
      <a className="grid gap-3 rounded-2xl bg-pure-surface p-5 text-inherit no-underline shadow-soft" href={`/posts/${leadPost.slug}/`} aria-label={`Lees ${leadPost.title}`}>
        {leadImage && <img className="aspect-[4/5] w-full rounded-2xl object-cover" src={archiveAssetUrl(leadImage)} alt="" loading="eager" decoding="async" />}
        <div>
          <p className="m-0 text-sm text-slate-ink">{formatArchiveDate(leadPost)}</p>
          <strong className="block text-3xl font-medium leading-tight">{leadPost.title}</strong>
        </div>
      </a>
    </section>
  )
}
