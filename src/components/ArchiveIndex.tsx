import { useState } from 'react'
import ArchiveRow from './ArchiveRow'
import ArchiveViewToggle, { type ArchiveViewMode } from './ArchiveViewToggle'
import type { PostSummary } from '../lib/postIndex'

type Props = {
  aggregatedPosts: PostSummary[]
  allPosts: PostSummary[]
}

export default function ArchiveIndex({ aggregatedPosts, allPosts }: Props) {
  const [mode, setMode] = useState<ArchiveViewMode>('aggregated')
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
        <ArchiveViewToggle mode={mode} aggregatedCount={aggregatedPosts.length} allCount={allPosts.length} onChange={setMode} />
      </section>
      <section className="site-shell space-y-1 pb-56 pt-6" aria-label="Alle blogberichten">
        {posts.map((post, index) => <ArchiveRow post={post} index={index} total={posts.length} key={`${mode}-${post.id}`} />)}
      </section>
    </>
  )
}
