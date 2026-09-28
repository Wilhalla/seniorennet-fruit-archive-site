import { useState } from 'react'
import { ArrowRight, ImageIcon, Loader2, Search, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { formatArchiveDate } from '../../lib/archiveDateTime'
import { useLazySearchIndex, useSearchManifest, useSearchResults, useTitleSearchResults, useUrlBackedSearchQuery } from './searchClientHooks'

function snippet(block: string, terms: string[] = []) {
  const lower = block.toLowerCase()
  const first = terms
    .map((term) => lower.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]
  if (first === undefined) return block.slice(0, 320)
  const start = Math.max(0, first - 130)
  const end = Math.min(block.length, first + 260)
  return `${start > 0 ? '…' : ''}${block.slice(start, end)}${end < block.length ? '…' : ''}`
}

function highlight(text: string, terms: string[] = []) {
  if (!terms.length) return text
  const escaped = terms.filter((term) => term.length > 1).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!escaped.length) return text
  const regex = new RegExp(`(${escaped.join('|')})`, 'ig')
  return text.split(regex).map((part, index) => regex.test(part) ? <mark key={index}>{part}</mark> : part)
}

export default function SearchApp() {
  const { query, setQuery } = useUrlBackedSearchQuery()
  const [fullTextEnabled, setFullTextEnabled] = useState(false)
  const manifest = useSearchManifest()
  const titleSearch = useTitleSearchResults(query)
  const { chunks, loading: fullTextLoading, loaded: fullTextLoaded } = useLazySearchIndex(query, fullTextEnabled, manifest)
  const fullTextResults = useSearchResults(chunks, query)
  const results = fullTextLoaded ? fullTextResults : titleSearch.results
  const loading = fullTextLoaded ? fullTextLoading : titleSearch.loading

  return (
    <section className="site-shell py-20" aria-labelledby="search-title">
      <header className="relative grid gap-8 overflow-hidden border-b border-chalk pb-10 md:grid-cols-[minmax(0,0.72fr)_minmax(16rem,0.28fr)]">
        <img className="apple-image absolute right-0 top-0 hidden w-24 rotate-6 opacity-80 md:block" src="/apple-assets/apple-1-160.webp" alt="" aria-hidden="true" loading="eager" decoding="async" />
        <div>
          <h1 id="search-title" className="display-title">Zoeken</h1>
          <p className="mt-4 max-w-2xl text-body-lg leading-body-lg text-slate-ink">Zoek op titel, tekst of trefwoord.</p>
        </div>
        <div className="self-end pr-28 text-sm text-slate-ink max-md:pr-0">
          {fullTextLoading ? <span className="inline-flex items-center gap-1.5"><Loader2 className="size-4 animate-spin" /> Volledige index laden…</span> : <span className="inline-flex items-center gap-1.5"><Sparkles className="size-4" /> {manifest?.postCount.toLocaleString('nl-BE')} berichten doorzoekbaar</span>}
        </div>
      </header>

      <div className="min-w-0 border-b border-chalk py-6">
        <label className="flex min-h-14 min-w-0 items-center gap-3 bg-transparent">
          <Search className="size-5 shrink-0 text-slate-ink" aria-hidden="true" />
          <Input className="min-w-0 flex-1 border-0 bg-transparent px-0 text-xl shadow-none outline-none placeholder:text-slate-ink/60 focus-visible:ring-0 md:text-2xl" autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setFullTextEnabled(true) }} placeholder="Zoek bv. sterappel, bijen, compost, boskoop…" />
        </label>
        <div className="mt-3 flex flex-wrap justify-between gap-3 text-sm text-slate-ink">
          <span>{query.trim().length < 2 ? 'Typ minstens twee letters.' : loading ? 'Zoekindex laden…' : `${results.length.toLocaleString('nl-BE')} resultaten${fullTextLoaded ? '' : ' in titels'}`}</span>
          {query.trim().length >= 2 && (
            <span className="inline-flex flex-wrap items-center gap-3">
              {!fullTextLoaded && <button className="font-medium text-obsidian underline decoration-chalk underline-offset-4 hover:decoration-obsidian" type="button" onClick={() => setFullTextEnabled(true)}>{fullTextLoading ? 'Volledige tekst laden…' : 'Zoek ook in volledige tekst'}</button>}
              <span>Gesorteerd op relevantie</span>
            </span>
          )}
        </div>
      </div>

      <div className="grid" aria-live="polite">
        {query.trim().length >= 2 && !loading && results.length === 0 && <p className="m-0 border-b border-chalk py-10 text-slate-ink">Geen resultaten.</p>}
        {results.map((result) => {
          const terms = result.terms ?? []
          const text = result.block ? snippet(result.block, terms) : 'Titelmatch. Laad de volledige tekstindex om in berichtinhoud en fragmenten te zoeken.'
          return (
            <article className="grid min-w-0 items-start gap-5 border-b border-chalk py-7 md:grid-cols-[minmax(0,1fr)_9rem]" key={result.id}>
              <div className="min-w-0">
                <p className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-xs leading-snug tracking-tight text-slate-ink">{formatArchiveDate(result)}{typeof result.blockIndex === 'number' ? ` · blok ${result.blockIndex + 1}` : ' · titelindex'}{typeof result.score === 'number' ? ` · score ${Math.round(result.score)}` : ''}</p>
                <h2 className="m-0 break-words font-heading text-3xl font-normal leading-tight tracking-tight text-midnight-navy [overflow-wrap:anywhere] md:text-4xl"><a className="text-inherit no-underline hover:underline" href={result.url}>{highlight(result.title, terms)}</a></h2>
                <p className="my-3 max-w-5xl break-words text-slate-ink [overflow-wrap:anywhere]">{highlight(text, terms)}</p>
                <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-ink">
                  <span className="inline-flex shrink-0 items-center gap-1.5"><ImageIcon className="size-3.5" aria-hidden="true" />{result.imageCount} beelden</span>
                  {terms.length > 0 && <span className="min-w-0 break-words [overflow-wrap:anywhere]">{terms.slice(0, 5).join(', ')}</span>}
                </p>
              </div>
              <a className="inline-flex items-center gap-2 justify-self-start text-sm font-medium text-obsidian no-underline hover:underline md:justify-self-end" href={result.url}>Lees bericht <ArrowRight className="size-4" /></a>
            </article>
          )
        })}
      </div>
    </section>
  )
}
