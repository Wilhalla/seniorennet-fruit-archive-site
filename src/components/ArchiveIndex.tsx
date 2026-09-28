import { useState } from 'react'
import ArchiveRow from './ArchiveRow'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import type { PostSummary } from '../lib/postIndex'

type Props = {
  aggregatedPosts: PostSummary[]
  allPosts: PostSummary[]
}

const aggregatedTooltip = 'Bundelt vervolg-, aanvulling- en deelberichten tot één reeks, zodat lange verhalen als één bericht verschijnen.'
const allPostsTooltip = 'Toont elk oorspronkelijk geïmporteerd blogbericht apart, ook vervolg-, aanvulling- en deelberichten.'

export default function ArchiveIndex({ aggregatedPosts, allPosts }: Props) {
  const [mode, setMode] = useState<'aggregated' | 'all'>('aggregated')
  const posts = mode === 'aggregated' ? aggregatedPosts : allPosts

  return (
    <>
      <section className="site-shell flex items-end justify-between gap-6 border-b border-rule py-6 max-md:flex-col max-md:items-start" aria-label="Archiefweergave">
        <div>
          <h2 className="m-0 font-heading text-3xl font-normal tracking-tight">Reeksen samenvoegen?</h2>
          <p className="section-kicker">
            Samengevoegd toont vervolg-, aanvulling- en deelberichten als één reeks. Losse berichten toont de originele import.
          </p>
        </div>
        <TooltipProvider>
          <div className="inline-flex rounded-full bg-pure-surface p-1 shadow-soft" role="group" aria-label="Kies archiefweergave">
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className={`rounded-full px-4 py-2 text-sm transition ${mode === 'aggregated' ? 'bg-obsidian text-eggshell' : 'text-slate-ink hover:bg-powder hover:text-obsidian'}`} onClick={() => setMode('aggregated')}>
                  Samengevoegd <span className="font-mono">{aggregatedPosts.length.toLocaleString('nl-BE')}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-72 text-center leading-snug">
                {aggregatedTooltip}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className={`rounded-full px-4 py-2 text-sm transition ${mode === 'all' ? 'bg-obsidian text-eggshell' : 'text-slate-ink hover:bg-powder hover:text-obsidian'}`} onClick={() => setMode('all')}>
                  Losse berichten <span className="font-mono">{allPosts.length.toLocaleString('nl-BE')}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-72 text-center leading-snug">
                {allPostsTooltip}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </section>
      <section className="site-shell space-y-1 pb-56 pt-6" aria-label="Alle blogberichten">
        {posts.map((post, index) => <ArchiveRow post={post} index={index} total={posts.length} key={`${mode}-${post.id}`} />)}
      </section>
    </>
  )
}
