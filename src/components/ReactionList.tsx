import type { Reaction } from '../lib/postDetails'
import { rewriteArchiveAssetUrls } from '../lib/assetUrls'

type Props = { reactions: Reaction[] }

export default function ReactionList({ reactions }: Props) {
  if (reactions.length === 0) return null

  const newestFirstReactions = [...reactions].sort((a, b) => {
    const aTime = Date.parse(a.isoDate)
    const bTime = Date.parse(b.isoDate)

    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
    if (Number.isNaN(aTime)) return 1
    if (Number.isNaN(bTime)) return -1
    return bTime - aTime
  })

  return (
    <section id="reactions" className="site-shell border-t border-rule py-14 md:py-16" aria-labelledby="reactions-title">
      <div className="mx-auto max-w-5xl">
        <header className="grid gap-6 border-b border-chalk pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <h2 id="reactions-title" className="section-title">Reacties</h2>
            <p className="section-kicker">Bewaarde reacties bij dit bericht, als doorlopende gesprekslaag onder de post.</p>
          </div>
          <p className="m-0 flex items-baseline gap-2 text-gravel" aria-label={`${reactions.length} reacties`}>
            <span className="font-mono text-3xl leading-none tracking-tight text-obsidian">{reactions.length.toLocaleString('nl-BE')}</span>
            <span className="text-sm">reacties</span>
          </p>
        </header>

        <ol className="m-0 list-none p-0">
          {newestFirstReactions.map((reaction, index) => {
            const timestamp = `${reaction.date}${reaction.time ? ` · ${reaction.time}` : ''}`

            return (
              <li className="border-b border-chalk last:border-b-0" key={reaction.id}>
                <article className="grid gap-4 py-6 md:grid-cols-[8.5rem_minmax(0,1fr)] md:gap-8 md:py-7">
                  <aside className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-gravel md:block" aria-label="Reactiemetadata">
                    <span className="font-mono text-xs uppercase tracking-[0.12em] text-slate">#{String(index + 1).padStart(2, '0')}</span>
                    <time className="md:mt-2 md:block" dateTime={reaction.isoDate}>{timestamp}</time>
                  </aside>
                  <div className="min-w-0">
                    <header className="grid gap-1">
                      <p className="m-0 text-sm font-medium text-obsidian">{reaction.author}</p>
                      <h3 className="m-0 text-base font-medium leading-6 text-obsidian">{reaction.title}</h3>
                    </header>
                    <div className="legacy-content mt-3 max-w-3xl border-l border-chalk pl-4 [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: rewriteArchiveAssetUrls(reaction.html) }} />
                  </div>
                </article>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
